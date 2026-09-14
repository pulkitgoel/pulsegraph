/** Legacy API: model-authored CSS is never executable application input. */
export function sanitizeAnimationCss(css: unknown): string {
  void css;
  return '';
}
export function sanitizeClassName(name: unknown): string {
  void name;
  return '';
}
export function sanitizeAiAnimations(animations?: unknown): undefined {
  void animations;
  return undefined;
}
