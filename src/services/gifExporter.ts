import { toCanvas } from 'html-to-image';
import gsap from 'gsap';

export async function exportGif(
  svgElement: HTMLElement,
  duration: number,
  onProgress?: (pct: number) => void
): Promise<string> {
  return new Promise(async (resolve, reject) => {
    try {
      const worker = new Worker(
        new URL('./gifWorker.ts', import.meta.url),
        { type: 'module' }
      );

      const fps = 15;
      const frames = fps * duration;
      const width = 1920;
      const height = 1080;

      // Initialize the worker for encoding
      worker.postMessage({ type: 'init', width, height, fps, frames });

      // We need to capture the exact SVG element using intrinsic dimensions
      const svgWidth = parseFloat(svgElement.getAttribute('width') || '1000');
      const svgHeight = parseFloat(svgElement.getAttribute('height') || '1000');
      const scale = Math.min(width / svgWidth, height / svgHeight) * 0.95; // 5% padding

      // Pause all GSAP animations so we can seek frame by frame
      const initialTime = gsap.globalTimeline.time();
      gsap.globalTimeline.pause();

      for (let f = 0; f < frames; f++) {
        // Advance animation by the frame step
        const t = (f / frames) * duration;
        gsap.globalTimeline.time(initialTime + t);

        // Render the DOM to a canvas using html-to-image at the scaled resolution
        const rawCanvas = await toCanvas(svgElement, {
          backgroundColor: 'transparent',
          pixelRatio: scale, 
          // Renders the intrinsic SVG scaled up by `scale`, returning a canvas of size (svgWidth * scale) x (svgHeight * scale)
        });

        // Create the final 1920x1080 frame
        const frameCanvas = document.createElement('canvas');
        frameCanvas.width = width;
        frameCanvas.height = height;
        const ctx = frameCanvas.getContext('2d');
        if (!ctx) throw new Error('Failed to get 2d context');

        // Draw background
        ctx.fillStyle = '#090B10';
        ctx.fillRect(0, 0, width, height);

        // Draw the diagram centered
        const dx = (width - rawCanvas.width) / 2;
        const dy = (height - rawCanvas.height) / 2;
        ctx.drawImage(rawCanvas, dx, dy);
        
        // Extract raw pixel data
        const imageData = ctx.getImageData(0, 0, width, height);
        
        // Send frame to worker for GIF encoding
        worker.postMessage(
          { type: 'frame', data: imageData.data.buffer, index: f },
          [imageData.data.buffer] // Transfer buffer for speed
        );

        onProgress?.(Math.round(((f + 1) / frames) * 50)); // Capture phase is 50%
      }

      // Resume animations
      gsap.globalTimeline.play();

      // Tell worker to finish and build GIF
      worker.postMessage({ type: 'finish' });

      worker.onmessage = (e) => {
        const msg = e.data;
        if (msg.type === 'progress') {
          onProgress?.(50 + Math.round(msg.pct / 2)); // Encoding phase is 50%
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

    } catch (err) {
      gsap.globalTimeline.play(); // Ensure we resume even on error
      reject(err);
    }
  });
}
