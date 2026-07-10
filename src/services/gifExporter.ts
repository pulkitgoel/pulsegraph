/**
 * Exports the diagram SVG as a crisp PNG or animated GIF using the browser's
 * native SVG rasterizer with inlined Google Fonts and high resolution scaling.
 * GIF encoding runs on the main thread with yields to ensure responsive progress.
 */
import gsap from 'gsap';
import { GIFEncoder, quantize, applyPalette } from 'gifenc';

async function fetchFontAsDataUri(url: string): Promise<string> {
  const res = await fetch(url);
  const blob = await res.blob();
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
}

let cachedFontCss: string | null = null;

async function getInlinedFontCss(): Promise<string> {
  if (cachedFontCss !== null) return cachedFontCss;
  try {
    const cssRes = await fetch(
      'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap'
    );
    let css = await cssRes.text();

    // Filter to latin-only subset blocks to keep payload lightweight (~80KB vs 1.7MB)
    const blocks = css.split('/*');
    let latinCss = '';
    for (const block of blocks) {
      if (block.toLowerCase().includes('latin')) {
        latinCss += '/*' + block;
      }
    }
    if (latinCss) {
      css = latinCss;
    }

    // Match URLs optionally enclosed in single or double quotes
    const fontUrls = [...css.matchAll(/url\(['"]?(https:\/\/fonts\.gstatic\.com\/[^)'"]+)['"]?\)/g)].map(m => m[1]);
    for (const fontUrl of fontUrls) {
      try {
        const dataUri = await fetchFontAsDataUri(fontUrl);
        css = css.replace(fontUrl, dataUri);
      } catch { /* skip */ }
    }
    cachedFontCss = css;
  } catch {
    cachedFontCss = '';
  }
  return cachedFontCss;
}

export type ExportFrame =
  | 'auto'
  | '16:9'
  | '16:10'
  | '4:3'
  | '1:1'
  | 'a4-landscape'
  | 'a4-portrait';

const EXPORT_PADDING = 40; // in original SVG units

// Aspect ratios (width : height) for each fixed frame.
const FRAME_ASPECTS: Record<Exclude<ExportFrame, 'auto'>, [number, number]> = {
  '16:9': [16, 9],
  '16:10': [16, 10],
  '4:3': [4, 3],
  '1:1': [1, 1],
  'a4-landscape': [297, 210],
  'a4-portrait': [210, 297],
};

/**
 * Computes the export canvas dimensions and the vector-space transform used to
 * place the content inside it.
 *
 * - 'auto' keeps the old behaviour: the canvas is exactly the content bounds
 *   (plus padding) upscaled by `maxScale`, so the image is a tight crop.
 * - '16:9' / '4:3' fit the content into a fixed-aspect frame using a single
 *   uniform scale (contain) and centre it, filling the rest with the background.
 *   This is what makes exports "fit in a window" instead of becoming a stretched
 *   thin strip — the aspect ratio is fixed and scaling is never distorted.
 */
function computeExportGeometry(
  svgW: number,
  svgH: number,
  frame: ExportFrame,
  maxScale: number
): { targetW: number; targetH: number; transform: string } {
  const P = EXPORT_PADDING;
  const rawW = svgW + P * 2;
  const rawH = svgH + P * 2;

  if (frame === 'auto') {
    const s = maxScale;
    return {
      targetW: Math.round(rawW * s),
      targetH: Math.round(rawH * s),
      transform: `scale(${s}) translate(${P}, ${P})`,
    };
  }

  // Fixed-aspect frame, high-res base long edge for crisp slides/docs.
  const BASE_LONG = 2560;
  const [aw, ah] = FRAME_ASPECTS[frame];
  // Put BASE_LONG on the longer edge so portrait frames are just as crisp.
  const frameW = aw >= ah ? BASE_LONG : Math.round((BASE_LONG * aw) / ah);
  const frameH = aw >= ah ? Math.round((BASE_LONG * ah) / aw) : BASE_LONG;

  // Contain-fit: single uniform scale so nothing is ever distorted.
  const s = Math.min(frameW / rawW, frameH / rawH);
  const offX = (frameW - rawW * s) / 2;
  const offY = (frameH - rawH * s) / 2;

  return {
    targetW: frameW,
    targetH: frameH,
    transform: `translate(${offX}, ${offY}) scale(${s}) translate(${P}, ${P})`,
  };
}

function serializeFrameSvg(
  svgElement: HTMLElement,
  targetW: number,
  targetH: number,
  contentTransform: string,
  fontCss: string,
  isGif: boolean
): string {
  const serializer = new XMLSerializer();
  const svgStr = serializer.serializeToString(svgElement);

  const parser = new DOMParser();
  const doc = parser.parseFromString(svgStr, 'image/svg+xml');
  const rootSvg = doc.documentElement;

  // Clear any inline styles that could override width/height attributes
  rootSvg.removeAttribute('style');

  // Set pixel dimensions to the FULL target (content + padding, scaled).
  // The browser rasterises the SVG at exactly these pixel dimensions.
  rootSvg.setAttribute('width', targetW.toString());
  rootSvg.setAttribute('height', targetH.toString());

  // Use a 1:1 viewBox to prevent the browser from rasterizing at low viewBox resolution and stretching the bitmap.
  rootSvg.setAttribute('viewBox', `0 0 ${targetW} ${targetH}`);

  // Scale + position the content internally in vector space using a wrapper <g>.
  const wrapperG = doc.createElementNS('http://www.w3.org/2000/svg', 'g');
  wrapperG.setAttribute('transform', contentTransform);

  // Move all content nodes (excluding defs and style) inside the wrapper
  const children = Array.from(rootSvg.childNodes);
  for (const child of children) {
    if (child.nodeName.toLowerCase() !== 'defs' && child.nodeName.toLowerCase() !== 'style') {
      wrapperG.appendChild(child);
    }
  }
  rootSvg.appendChild(wrapperG);

  // Optimize text rendering inside SVG using geometricPrecision
  rootSvg.querySelectorAll('text').forEach((t) => {
    t.setAttribute('text-rendering', 'geometricPrecision');
    t.setAttribute('shape-rendering', 'geometricPrecision');
  });

  // If exporting as GIF, strip heavy filters, glows, and gradients to prevent color quantization blur
  if (isGif) {
    // 1. Remove all glows
    const glows = rootSvg.querySelectorAll('[id^="glow-"]');
    glows.forEach(el => el.remove());

    // 2. Remove glass and pg filters from nodes and badges
    const filteredEls = rootSvg.querySelectorAll('[filter]');
    filteredEls.forEach(el => el.removeAttribute('filter'));

    // 3. Remove gradient overlays
    const overlays = rootSvg.querySelectorAll('[fill="url(#gradient-overlay)"]');
    overlays.forEach(el => el.remove());
  }

  let defs = rootSvg.querySelector('defs');
  if (!defs) {
    defs = doc.createElementNS('http://www.w3.org/2000/svg', 'defs');
    rootSvg.insertBefore(defs, rootSvg.firstChild);
  }
  const styleEl = doc.createElementNS('http://www.w3.org/2000/svg', 'style');
  // Inject text antialiasing and high-quality system font stacks as fallback
  const extraStyles = `
    text {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
      -webkit-font-smoothing: antialiased !important;
      -moz-osx-font-smoothing: grayscale !important;
      text-rendering: geometricPrecision !important;
    }
  `;
  styleEl.textContent = (fontCss || '') + extraStyles;
  defs.appendChild(styleEl);

  return serializer.serializeToString(rootSvg);
}

async function rasterizeSvg(
  svgStr: string,
  targetW: number,
  targetH: number,
  bgColor: string
): Promise<ImageData> {
  const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d')!;

  // Fill background first
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, targetW, targetH);

  // Classic Image → Canvas path is used because createImageBitmap often rasterises SVG
  // Blobs at their base intrinsic resolution first, then upscales the resulting bitmap.
  const url = URL.createObjectURL(blob);
  try {
    await new Promise<void>((resolve, reject) => {
      const img = new Image();
      // Explicitly set target width and height on the Image element before setting src.
      // This tells the browser's rasterizer to decode the SVG directly at these pixel dimensions.
      img.width = targetW;
      img.height = targetH;

      img.onload = async () => {
        try {
          // Ensure the image is fully decoded
          if ('decode' in img) {
            await img.decode();
          }
          // Brief delay to let base64 fonts register
          await new Promise((r) => setTimeout(r, 150));
        } catch { /* proceed */ }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        // 3-arg form: draw at natural size (which matches targetW/H), no bitmap rescaling
        ctx.drawImage(img, 0, 0);
        resolve();
      };
      img.onerror = (e) => reject(e);
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }

  return ctx.getImageData(0, 0, targetW, targetH);
}

/**
 * Downsamples the pixel array to speed up quantization.
 * Quantizing a large high-resolution frame (e.g. 4096x348 = 1.4M pixels) synchronously
 * can take 10+ seconds. Sampling ~10,000 pixels is 100x faster and yields a virtually
 * identical palette for clean diagrams.
 */
function getFastPalette(u8: Uint8Array | Uint8ClampedArray): any {
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

export async function exportPng(
  svgElement: HTMLElement,
  theme: 'dark' | 'light',
  onProgress?: (pct: number) => void,
  frame: ExportFrame = 'auto'
): Promise<string> {
  onProgress?.(10);

  const svgW = parseFloat(svgElement.getAttribute('width') || '1000');
  const svgH = parseFloat(svgElement.getAttribute('height') || '1000');

  // 5x vector upscale — the SVG rasteriser handles this in vector space for maximum resolution
  const SCALE = 5.0;

  const { targetW, targetH, transform } = computeExportGeometry(svgW, svgH, frame, SCALE);

  onProgress?.(30);
  const fontCss = await getInlinedFontCss();
  onProgress?.(60);

  const svgStr = serializeFrameSvg(
    svgElement, targetW, targetH, transform, fontCss, false
  );

  onProgress?.(80);

  const bgColor = theme === 'light' ? '#F8FAFC' : '#090B10';
  const imageData = await rasterizeSvg(svgStr, targetW, targetH, bgColor);

  // Convert to PNG blob
  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d')!;
  ctx.putImageData(imageData, 0, 0);

  const pngUrl = await new Promise<string>((resolve, reject) => {
    canvas.toBlob((b) => {
      if (!b) return reject(new Error('canvas.toBlob failed'));
      resolve(URL.createObjectURL(b));
    }, 'image/png');
  });

  onProgress?.(100);
  return pngUrl;
}

export async function exportGif(
  svgElement: HTMLElement,
  theme: 'dark' | 'light',
  duration: number = 3,
  onProgress?: (pct: number) => void,
  frame: ExportFrame = 'auto'
): Promise<string> {
  onProgress?.(5);

  const svgW = parseFloat(svgElement.getAttribute('width') || '1000');
  const svgH = parseFloat(svgElement.getAttribute('height') || '1000');

  // Cap so no dimension exceeds 4096px, then compute the fit geometry.
  const MAX_GIF_DIM = 4096;
  const rawW = svgW + EXPORT_PADDING * 2;
  const rawH = svgH + EXPORT_PADDING * 2;
  const SCALE = Math.min(5.0, MAX_GIF_DIM / rawW, MAX_GIF_DIM / rawH);

  let { targetW, targetH, transform } = computeExportGeometry(svgW, svgH, frame, SCALE);

  // Safety clamp for fixed frames (BASE_LONG is 2560, already < 4096, but guard anyway).
  if (targetW > MAX_GIF_DIM || targetH > MAX_GIF_DIM) {
    const k = Math.min(MAX_GIF_DIM / targetW, MAX_GIF_DIM / targetH);
    targetW = Math.round(targetW * k);
    targetH = Math.round(targetH * k);
    transform = `scale(${k}) ${transform}`;
  }

  const fps = 15;
  const frames = fps * duration;
  const delay = Math.round(1000 / fps);
  const bgColor = theme === 'light' ? '#F8FAFC' : '#090B10';

  onProgress?.(10);
  const fontCss = await getInlinedFontCss();
  onProgress?.(15);

  const initialTime = gsap.globalTimeline.time();
  gsap.globalTimeline.pause();

  const gif = GIFEncoder();

  try {
    // Phase 1: Go to the end of the animation and generate the global palette
    gsap.globalTimeline.time(initialTime + duration);
    const finalSvgStr = serializeFrameSvg(
      svgElement, targetW, targetH, transform, fontCss, true
    );
    const finalImageData = await rasterizeSvg(finalSvgStr, targetW, targetH, bgColor);
    const globalPalette = getFastPalette(finalImageData.data);

    onProgress?.(20);

    // Phase 2: Capture and encode all animation frames sequentially
    for (let f = 0; f < frames; f++) {
      const t = (f / frames) * duration;
      gsap.globalTimeline.time(initialTime + t);

      const frameSvgStr = serializeFrameSvg(
        svgElement, targetW, targetH, transform, fontCss, true
      );
      const imageData = await rasterizeSvg(frameSvgStr, targetW, targetH, bgColor);

      const u8 = imageData.data;
      const index = applyPalette(u8, globalPalette, { format: 'rgb565' });
      gif.writeFrame(index, targetW, targetH, { palette: globalPalette, delay });

      // Yield back to the browser's main thread every 5 frames so that the UI can paint
      // and update the progress bar smoothly.
      if (f % 5 === 0) {
        await new Promise((r) => setTimeout(r, 0));
      }

      // Map progress from 20% to 90% during capturing and encoding
      onProgress?.(20 + Math.round((f / frames) * 70));
    }

    gif.finish();
    const bytes = gif.bytes();
    const blob = new Blob([bytes], { type: 'image/gif' });
    const url = URL.createObjectURL(blob);

    onProgress?.(100);
    return url;
  } finally {
    // Reset timeline state
    gsap.globalTimeline.time(initialTime);
    gsap.globalTimeline.play();
  }
}
