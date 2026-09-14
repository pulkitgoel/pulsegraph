import { useCallback, useState } from 'react';
import { deserializeDocument, serializeDocument, type DiagramDocument } from './document';
import { readPreference, writePreference } from './storage';

const DRAFT_KEY = 'pulsegraph_document_v1';
interface DocumentHistory {
  past: DiagramDocument[];
  current: DiagramDocument | null;
  future: DiagramDocument[];
}

function restore(): DocumentHistory {
  const raw = readPreference(DRAFT_KEY);
  try {
    return { past: [], current: raw ? deserializeDocument(raw) : null, future: [] };
  } catch {
    return { past: [], current: null, future: [] };
  }
}

export function useDocument() {
  const [history, setHistory] = useState<DocumentHistory>(restore);
  const [saved, setSaved] = useState(true);

  const persist = useCallback((document: DiagramDocument | null) => {
    setSaved(writePreference(DRAFT_KEY, document ? serializeDocument(document) : null));
  }, []);

  function commit(document: DiagramDocument) {
    persist(document);
    setHistory((previous) => ({
      past: previous.current
        ? [...previous.past, previous.current].slice(-20)
        : previous.past,
      current: document,
      future: [],
    }));
  }

  function undo() {
    const document = history.past.at(-1);
    if (!document) return;
    persist(document);
    setHistory({
      past: history.past.slice(0, -1),
      current: document,
      future: history.current ? [history.current, ...history.future] : history.future,
    });
  }

  function redo() {
    const document = history.future[0];
    if (!document) return;
    persist(document);
    setHistory({
      past: history.current ? [...history.past, history.current] : history.past,
      current: document,
      future: history.future.slice(1),
    });
  }

  function reset() {
    persist(null);
    setHistory({ past: [], current: null, future: [] });
  }

  return {
    document: history.current,
    commit,
    undo,
    redo,
    reset,
    saved,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
  };
}
