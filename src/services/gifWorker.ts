import { GIFEncoder, quantize, applyPalette } from 'gifenc';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const workerSelf = self as any;

let gif: any = null;
let width = 0;
let height = 0;
let frames = 0;
let delay = 0;
let framesEncoded = 0;
let globalPalette: any = null;

/**
 * Downsamples the pixel array to speed up quantization.
 * Quantizing a large high-resolution frame (e.g. 4096x348 = 1.4M pixels) synchronously
 * can take 10+ seconds. Sampling ~10,000 pixels is 100x faster and yields a virtually
 * identical palette for clean diagrams.
 */
function getFastPalette(u8: Uint8Array): any {
  const pixelCount = u8.length / 4;
  const maxSamples = 10000;
  const step = Math.max(1, Math.floor(pixelCount / maxSamples));
  
  const sampled = new Uint8Array(Math.ceil(pixelCount / step) * 4);
  let sIdx = 0;
  for (let i = 0; i < u8.length; i += step * 4) {
    if (i + 3 < u8.length) {
      sampled[sIdx] = u8[i];
      sampled[sIdx + 1] = u8[i + 1];
      sampled[sIdx + 2] = u8[i + 2];
      sampled[sIdx + 3] = u8[i + 3];
      sIdx += 4;
    }
  }
  return quantize(sampled.subarray(0, sIdx), 256, { format: 'rgb565' });
}

workerSelf.onmessage = (e: MessageEvent) => {
  const msg = e.data;

  if (msg.type === 'init') {
    width = msg.width;
    height = msg.height;
    frames = msg.frames;
    delay = Math.round(1000 / msg.fps);
    gif = GIFEncoder();
    framesEncoded = 0;
    globalPalette = null;
  } 
  else if (msg.type === 'palette') {
    const u8 = new Uint8Array(msg.data);
    globalPalette = getFastPalette(u8);
  }
  else if (msg.type === 'frame') {
    if (!gif) return;
    const u8 = new Uint8Array(msg.data);
    const palette = globalPalette || getFastPalette(u8);
    const index = applyPalette(u8, palette, { format: 'rgb565' });
    gif.writeFrame(index, width, height, { palette, delay });
    
    framesEncoded++;
    // Report progress (encoding phase is the second 50% of the total progress)
    workerSelf.postMessage({ type: 'progress', pct: Math.round((framesEncoded / frames) * 100) });
  } 
  else if (msg.type === 'finish') {
    if (!gif) return;
    gif.finish();
    const bytes = gif.bytes();
    const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    workerSelf.postMessage({ type: 'progress', pct: 100 });
    workerSelf.postMessage({ type: 'done', buffer: buf }, [buf]);
    gif = null;
    globalPalette = null;
  }
};
