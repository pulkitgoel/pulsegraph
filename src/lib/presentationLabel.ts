let measuringContext: CanvasRenderingContext2D | null | undefined;
function textWidth(text: string, fontSize: number) {
  if (measuringContext === undefined && typeof document !== 'undefined')
    measuringContext = document.createElement('canvas').getContext('2d');
  if (measuringContext) {
    // Reserve bold width for every line, including the regular-weight continuation.
    measuringContext.font = `650 ${fontSize}px Inter, Segoe UI, Arial, sans-serif`;
    return measuringContext.measureText(text).width;
  }
  // Conservative sizing for non-browser layout consumers.
  return Array.from(text).reduce(
    (width, char) =>
      width +
      fontSize *
        (/[ilI.,'!:;|\s]/u.test(char)
          ? 0.35
          : /[mwMW@\p{Script=Han}]/u.test(char)
            ? 1
            : 0.7),
    0,
  );
}

function wrap(label: string, fontSize: number) {
  return label
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .split('\n')
    .flatMap((part) => {
      const result: string[] = [];
      for (const word of part.split(/\s+/).filter(Boolean)) {
        const last = result.length - 1;
        if (last >= 0 && textWidth(result[last] + ' ' + word, fontSize) <= 128) {
          result[last] += ' ' + word;
          continue;
        }
        let chunk = '';
        for (const char of word) {
          if (chunk && textWidth(chunk + char, fontSize) > 128) {
            result.push(chunk);
            chunk = '';
          }
          chunk += char;
        }
        if (chunk) result.push(chunk);
      }
      return result;
    });
}

/** Shared by the SVG and router so every visible label is inside its node bounds. */
export function presentationLabel(label: string) {
  let lines = wrap(label, 15);
  const fontSize = lines.length > 3 ? 13 : 15;
  if (fontSize === 13) lines = wrap(label, fontSize);
  const lineHeight = fontSize === 13 ? 15 : 18;
  const firstBaseline = 91;
  return {
    lines,
    fontSize,
    lineHeight,
    firstBaseline,
    height: Math.max(140, firstBaseline + (lines.length - 1) * lineHeight + 12),
  };
}
