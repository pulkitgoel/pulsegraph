import { GIFEncoder, quantize, applyPalette } from 'gifenc';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const workerSelf = self as any;

let gif: any = null;
let width = 0;
let height = 0;
let frames = 0;
let delay = 0;
let framesEncoded = 0;

workerSelf.onmessage = (e: MessageEvent) => {
  const msg = e.data;

  if (msg.type === 'init') {
    width = msg.width;
    height = msg.height;
    frames = msg.frames;
    delay = Math.round(1000 / msg.fps);
    gif = GIFEncoder();
    framesEncoded = 0;
  } 
  else if (msg.type === 'frame') {
    if (!gif) return;
    const u8 = new Uint8Array(msg.data);
    const palette = quantize(u8, 256);
    const index = applyPalette(u8, palette);
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
  }
};
