/**
 * Sanitizer for LLM-authored animation CSS before it is injected into the DOM.
 *
 * The model is only ever asked for @keyframes + simple class rules (float /
 * pulse / glow). Anything that could exfiltrate data or load external
 * resources (url(), @import, element() …) or smuggle markup is rejected
 * wholesale — a dropped animation is cosmetic, an injected style is not.
 */
const DANGEROUS = new RegExp(
  [
    'url\\s*\\(',        // network fetch / exfiltration
    'image-set\\s*\\(',
    'element\\s*\\(',
    '@import',
    '@charset',
    '@namespace',
    '@document',
    'expression\\s*\\(', // legacy IE JS execution
    'javascript\\s*:',
    'behavior\\s*:',
    'binding\\s*:',
    '-moz-binding',
    '<',                 // no markup of any kind inside a <style> payload
    '&#',                // no HTML entities
    '\\\\[0-9a-fA-F]',   // no CSS escape sequences (obfuscation)
  ].join('|'),
  'i',
);

const MAX_CSS_LENGTH = 20_000;

/** Returns the CSS if it is safe, otherwise ''. */
export function sanitizeAnimationCss(css: string | undefined | null): string {
  if (!css) return '';
  if (css.length > MAX_CSS_LENGTH) return '';
  if (DANGEROUS.test(css)) return '';
  return css;
}

/** Class names must be simple identifiers; anything else is dropped. */
export function sanitizeClassName(name: string | undefined | null): string {
  if (!name) return '';
  return /^[A-Za-z_][A-Za-z0-9_-]*$/.test(name) ? name : '';
}

export interface AiAnimations { cssKeyframes: string; nodeClasses: Record<string, string> }

export function sanitizeAiAnimations(a?: AiAnimations | null): AiAnimations | undefined {
  if (!a) return undefined;
  const nodeClasses: Record<string, string> = {};
  for (const [id, cls] of Object.entries(a.nodeClasses || {})) {
    const clean = sanitizeClassName(String(cls));
    if (clean) nodeClasses[id] = clean;
  }
  return { cssKeyframes: sanitizeAnimationCss(a.cssKeyframes), nodeClasses };
}
