export type ExportFrame =
  'auto' | '16:9' | '16:10' | '4:3' | '1:1' | 'a4-landscape' | 'a4-portrait';

const ASPECTS: Record<Exclude<ExportFrame, 'auto'>, number> = {
  '16:9': 16 / 9,
  '16:10': 16 / 10,
  '4:3': 4 / 3,
  '1:1': 1,
  'a4-landscape': 297 / 210,
  'a4-portrait': 210 / 297,
};

/** One framing contract for PNG, GIF and presentation PNG. */
export function exportGeometry(
  width: number,
  height: number,
  frame: ExportFrame,
  maxDimension = 2560,
) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error('Diagram has invalid export dimensions.');
  }
  const padding = 40;
  const rawWidth = width + padding * 2;
  const rawHeight = height + padding * 2;
  const aspect = frame === 'auto' ? rawWidth / rawHeight : ASPECTS[frame];
  if (!aspect) throw new Error('Unsupported export frame.');
  const targetWidth = Math.max(
    1,
    Math.round(aspect >= 1 ? maxDimension : maxDimension * aspect),
  );
  const targetHeight = Math.max(
    1,
    Math.round(aspect >= 1 ? maxDimension / aspect : maxDimension),
  );
  const scale = Math.min(targetWidth / rawWidth, targetHeight / rawHeight);
  const x = (targetWidth - width * scale) / 2;
  const y = (targetHeight - height * scale) / 2;
  return {
    width: targetWidth,
    height: targetHeight,
    transform: 'translate(' + x + ' ' + y + ') scale(' + scale + ')',
  };
}
