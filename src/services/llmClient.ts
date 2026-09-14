import type { ChatMessage, LlmProvider, OllamaModel } from '../types';
import { readCompletion } from './llmValidation';

const PROVIDERS = {
  deepseek: {
    // Thinking mode is disabled below, so a normal call returns in a few
    // seconds. A long deadline only makes a genuine failure feel like a hang.
    url: 'https://api.deepseek.com/v1/chat/completions',
    timeoutMs: 60_000,
  },
  ollama: {
    url: 'http://localhost:11434/v1/chat/completions',
    timeoutMs: 180_000,
  },
} as const;

const MAX_RESPONSE_BYTES = 200_000;

export interface LlmRequest {
  systemPrompt: string;
  content: string;
  history?: ChatMessage[];
  apiKey: string;
  provider: LlmProvider;
  model: OllamaModel;
  signal?: AbortSignal;
}

function buildHeaders(request: LlmRequest): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (request.provider === 'deepseek') {
    const key = request.apiKey.trim();
    const hasInvalidCharacter = [...key].some((character) => {
      const code = character.charCodeAt(0);
      return code < 33 || code > 126;
    });

    if (!key || hasInvalidCharacter) {
      throw new Error('Enter a valid DeepSeek key in AI settings.');
    }

    headers.Authorization = 'Bearer ' + key;
  }

  return headers;
}

function httpError(status: number, detail?: string): Error {
  if (status === 401) {
    return new Error('The provider rejected the API key. Update AI settings.');
  }

  if (status === 429) {
    return new Error('The provider is rate limiting requests. Wait and retry.');
  }

  // Surface the provider's own message. A rejected model name or request field
  // is otherwise indistinguishable from any other failure.
  const suffix = detail ? ' — ' + detail.slice(0, 300) : '';
  return new Error('The AI provider returned HTTP ' + status + suffix, {
    cause: detail,
  });
}

/** Read a failed response's body without letting that read mask the HTTP error. */
async function errorDetail(response: Response): Promise<string | undefined> {
  try {
    const text = (await response.text()).trim();
    if (!text) return undefined;

    try {
      const parsed: unknown = JSON.parse(text);
      if (parsed && typeof parsed === 'object') {
        const error = (parsed as { error?: { message?: unknown } }).error;
        if (error && typeof error.message === 'string') return error.message;
      }
    } catch {
      // Not JSON; fall through to the raw text.
    }

    return text;
  } catch {
    return undefined;
  }
}

/** Bound the response while reading, before allocating the entire payload. */
async function readResponse(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('The provider returned an empty response.');
  }

  const decoder = new TextDecoder();
  let bytes = 0;
  let text = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      bytes += value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new Error('The AI response exceeded the size limit.');
      }

      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    reader.releaseLock();
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error('The provider returned an invalid JSON response.');
  }
}

/**
 * Requests are cancellable and bounded. We do not retry automatically because
 * an uncertain retry can incur an additional charge for the user's API key.
 */
export async function requestCompletion(
  request: LlmRequest,
): Promise<Record<string, unknown>> {
  if (request.content.length > 60_000) {
    throw new Error('The request is too large. Shorten the description.');
  }

  const provider = PROVIDERS[request.provider];
  if (!provider) {
    throw new Error('Choose a supported provider in AI settings.');
  }

  const headers = buildHeaders(request);
  const timeout = AbortSignal.timeout(provider.timeoutMs);
  const signal = request.signal ? AbortSignal.any([request.signal, timeout]) : timeout;

  const history = (request.history ?? []).slice(-4).map((message) => ({
    role: message.role,
    content: message.content.slice(0, 4_000),
  }));

  try {
    const response = await fetch(provider.url, {
      method: 'POST',
      signal,
      headers,
      body: JSON.stringify({
        model: request.provider === 'deepseek' ? 'deepseek-flash' : request.model,
        // Keep interactive diagram requests in non-thinking mode. DeepSeek
        // enables thinking by default, which can exceed the request deadline.
        ...(request.provider === 'deepseek' ? { thinking: { type: 'disabled' } } : {}),
        messages: [
          { role: 'system', content: request.systemPrompt },
          ...history,
          { role: 'user', content: request.content },
        ],
        temperature: 0.1,
        max_tokens: 6_000,
        stream: false,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      throw httpError(response.status, await errorDetail(response));
    }

    return readCompletion(await readResponse(response));
  } catch (error) {
    if (request.signal?.aborted) {
      throw new Error('Request cancelled. Your diagram was kept.', { cause: error });
    }

    if (timeout.aborted) {
      throw new Error('The request timed out. Your diagram was kept; please retry.', {
        cause: error,
      });
    }

    if (error instanceof TypeError) {
      const message =
        request.provider === 'ollama'
          ? 'Cannot reach Ollama. Check localhost:11434, the model, and allowed origins.'
          : 'Cannot reach DeepSeek. Check your connection and retry.';
      throw new Error(message, { cause: error });
    }

    throw error;
  }
}
