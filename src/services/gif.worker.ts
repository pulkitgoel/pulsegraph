import { GIFEncoder, quantize, applyPalette, type Palette } from 'gifenc';

type EncoderMessage =
  | { type: 'frame'; pixels: ArrayBuffer; width: number; height: number; delay: number }
  | { type: 'finish' };

const encoder = GIFEncoder();
let palette: Palette | null = null;
self.onmessage = (event: MessageEvent<EncoderMessage>) => {
  try {
    if (event.data.type === 'finish') {
      encoder.finish();
      const bytes = encoder.bytes();
      self.postMessage({ type: 'done', bytes });
      return;
    }
    const { pixels, width, height, delay } = event.data;
    const rgba = new Uint8Array(pixels);
    const stride = Math.max(1, Math.floor(rgba.length / 4 / 50_000));
    const sample = new Uint8Array(Math.ceil(rgba.length / 4 / stride) * 4);
    let index = 0;
    for (let offset = 0; offset < rgba.length; offset += stride * 4) {
      sample.set(rgba.subarray(offset, offset + 4), index);
      index += 4;
    }
    palette ??= quantize(sample.subarray(0, index), 256);
    const indexed = applyPalette(rgba, palette);
    encoder.writeFrame(indexed, width, height, { palette, delay });
    self.postMessage({ type: 'ready' });
  } catch (error) {
    self.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : 'GIF encoding failed.',
    });
  }
};
