/**
 * Exports the diagram SVG as a crisp PNG or animated GIF using the browser's
 * native SVG rasterizer with inlined Google Fonts.
 */
import gsap from 'gsap';

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

function serializeFrameSvg(
  svgElement: HTMLElement,
  canvasW: number,
  canvasH: number,
  svgW: number,
  svgH: number,
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

  rootSvg.setAttribute('width', canvasW.toString());
  rootSvg.setAttribute('height', canvasH.toString());
  rootSvg.setAttribute('viewBox', `0 0 ${svgW} ${svgH}`);

  // Optimize text rendering inside SVG using geometricPrecision
  rootSvg.querySelectorAll('text').forEach((t) => {
    t.setAttribute('text-rendering', 'geometricPrecision');
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

export async function exportPng(
  svgElement: HTMLElement,
  theme: 'dark' | 'light',
  onProgress?: (pct: number) => void
): Promise<string> {
  onProgress?.(10);

  const svgW = parseFloat(svgElement.getAttribute('width') || '1000');
  const svgH = parseFloat(svgElement.getAttribute('height') || '1000');

  // Use a 3x resolution scale factor for ultra-crisp output
  const SCALE = 3.0;
  const PADDING = 40; // 40px padding around the diagram bounds

  const canvasW = Math.round(svgW * SCALE);
  const canvasH = Math.round(svgH * SCALE);
  const targetW = Math.round((svgW + PADDING * 2) * SCALE);
  const targetH = Math.round((svgH + PADDING * 2) * SCALE);

  onProgress?.(30);
  const fontCss = await getInlinedFontCss();
  onProgress?.(60);

  const svgStr = serializeFrameSvg(svgElement, canvasW, canvasH, svgW, svgH, fontCss, false);

  onProgress?.(80);

  const pngUrl = await new Promise<string>((resolve, reject) => {
    const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    // Explicitly set width and height properties to force high-DPI rasterization
    img.width = canvasW;
    img.height = canvasH;
    img.onload = async () => {
      try {
        if ('decode' in img) {
          await img.decode();
        }
        // Hold on rendering to ensure base64 fonts are parsed and registered by the browser
        await new Promise((r) => setTimeout(r, 100));
      } catch (err) {
        console.warn('Image decode / font loading delay failed:', err);
      }

      // Compose onto the final canvas with background and padding
      const canvas = document.createElement('canvas');
      canvas.width  = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d')!;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      if ('textRendering' in ctx) {
        (ctx as any).textRendering = 'geometricPrecision';
      }
      
      // Fill theme background color
      ctx.fillStyle = theme === 'light' ? '#F8FAFC' : '#090B10';
      ctx.fillRect(0, 0, targetW, targetH);
      
      // Draw diagram at exact scaled dimensions with rounded padding offset
      const dx = Math.round(PADDING * SCALE);
      const dy = Math.round(PADDING * SCALE);
      ctx.drawImage(img, dx, dy, canvasW, canvasH);
      
      URL.revokeObjectURL(url);
      canvas.toBlob((b) => {
        if (!b) return reject(new Error('canvas.toBlob failed'));
        resolve(URL.createObjectURL(b));
      }, 'image/png');
    };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });

  onProgress?.(100);
  return pngUrl;
}

export async function exportGif(
  svgElement: HTMLElement,
  theme: 'dark' | 'light',
  duration: number = 3,
  onProgress?: (pct: number) => void
): Promise<string> {
  onProgress?.(5);

  const svgW = parseFloat(svgElement.getAttribute('width') || '1000');
  const svgH = parseFloat(svgElement.getAttribute('height') || '1000');

  // Scale of 3.0x is optimal for high-resolution clarity and crisp rendering
  const SCALE = 3.0;
  const PADDING = 40;
  const rawW = svgW + PADDING * 2;
  const rawH = svgH + PADDING * 2;
  
  // Cap maximum GIF dimension to 4096px
  const MAX_GIF_DIM = 4096;
  const scale = Math.min(SCALE, Math.min(MAX_GIF_DIM / rawW, MAX_GIF_DIM / rawH));

  const canvasW = Math.round(svgW * scale);
  const canvasH = Math.round(svgH * scale);
  const targetW = Math.round(rawW * scale);
  const targetH = Math.round(rawH * scale);

  const fps = 15;
  const frames = fps * duration;

  onProgress?.(10);
  const fontCss = await getInlinedFontCss();
  onProgress?.(15);

  const worker = new Worker(
    new URL('./gifWorker.ts', import.meta.url),
    { type: 'module' }
  );

  worker.postMessage({ type: 'init', width: targetW, height: targetH, fps, frames });

  const initialTime = gsap.globalTimeline.time();
  gsap.globalTimeline.pause();

  try {
    // Phase 1: Go to the end of the animation and generate the global palette
    // This resolves color quantization flicker and makes text/line details stable
    gsap.globalTimeline.time(initialTime + duration);
    const finalSvgStr = serializeFrameSvg(svgElement, canvasW, canvasH, svgW, svgH, fontCss, true);
    const finalBlob = new Blob([finalSvgStr], { type: 'image/svg+xml;charset=utf-8' });
    const finalUrl = URL.createObjectURL(finalBlob);
    const finalImg = new Image();
    finalImg.width = canvasW;
    finalImg.height = canvasH;

    const finalImageData = await new Promise<ImageData>((resolve, reject) => {
      finalImg.onload = async () => {
        try {
          if ('decode' in finalImg) {
            await finalImg.decode();
          }
          // Hold on rendering to ensure base64 fonts are parsed and registered by the browser
          await new Promise((r) => setTimeout(r, 100));
        } catch (err) {
          console.warn('Palette frame decode / font loading delay failed:', err);
        }

        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d')!;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        if ('textRendering' in ctx) {
          (ctx as any).textRendering = 'geometricPrecision';
        }
        ctx.fillStyle = theme === 'light' ? '#F8FAFC' : '#090B10';
        ctx.fillRect(0, 0, targetW, targetH);
        ctx.drawImage(finalImg, Math.round(PADDING * scale), Math.round(PADDING * scale), canvasW, canvasH);
        
        URL.revokeObjectURL(finalUrl);
        resolve(ctx.getImageData(0, 0, targetW, targetH));
      };
      finalImg.onerror = (e) => { URL.revokeObjectURL(finalUrl); reject(e); };
      finalImg.src = finalUrl;
    });

    worker.postMessage(
      { type: 'palette', data: finalImageData.data.buffer },
      [finalImageData.data.buffer]
    );

    onProgress?.(20);

    // Phase 2: Capture all animation frames sequentially using the global palette
    for (let f = 0; f < frames; f++) {
      const t = (f / frames) * duration;
      gsap.globalTimeline.time(initialTime + t);

      const frameSvgStr = serializeFrameSvg(svgElement, canvasW, canvasH, svgW, svgH, fontCss, true);
      const blob = new Blob([frameSvgStr], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.width = canvasW;
      img.height = canvasH;

      const imageData = await new Promise<ImageData>((resolve, reject) => {
        img.onload = async () => {
          try {
            if ('decode' in img) {
              await img.decode();
            }
          } catch (err) {
            console.warn('Frame decode failed:', err);
          }
          const canvas = document.createElement('canvas');
          canvas.width = targetW;
          canvas.height = targetH;
          const ctx = canvas.getContext('2d')!;
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          if ('textRendering' in ctx) {
            (ctx as any).textRendering = 'geometricPrecision';
          }
          
          ctx.fillStyle = theme === 'light' ? '#F8FAFC' : '#090B10';
          ctx.fillRect(0, 0, targetW, targetH);
          ctx.drawImage(img, Math.round(PADDING * scale), Math.round(PADDING * scale), canvasW, canvasH);
          
          URL.revokeObjectURL(url);
          resolve(ctx.getImageData(0, 0, targetW, targetH));
        };
        img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
        img.src = url;
      });

      worker.postMessage(
        { type: 'frame', data: imageData.data.buffer, index: f },
        [imageData.data.buffer]
      );

      // Map progress from 20% to 70% during frame capturing
      onProgress?.(20 + Math.round((f / frames) * 50));
    }
  } finally {
    // Reset timeline state
    gsap.globalTimeline.time(initialTime);
    gsap.globalTimeline.play();
  }

  worker.postMessage({ type: 'finish' });

  return new Promise<string>((resolve, reject) => {
    worker.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === 'progress') {
        // Map progress from 70% to 100% during GIF encoding
        onProgress?.(70 + Math.round((msg.pct / 100) * 30));
      } else if (msg.type === 'error') {
        worker.terminate();
        reject(new Error(msg.message || 'Worker error'));
      } else if (msg.type === 'done' && msg.buffer) {
        worker.terminate();
        const u8 = new Uint8Array(msg.buffer);
        const blob = new Blob([u8], { type: 'image/gif' });
        resolve(URL.createObjectURL(blob));
      }
    };
    worker.onerror = (err) => {
      worker.terminate();
      reject(new Error(err.message || 'Worker failed'));
    };
  });
}
