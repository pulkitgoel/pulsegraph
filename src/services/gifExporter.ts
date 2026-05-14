import type { Graph } from '../types';

/**
 * Encodes the graph as an animated GIF in a Web Worker (non-blocking).
 * Returns a blob: URL — display a download <a> link for the user to click.
 */
export function exportGif(
  graph: Graph,
  onProgress?: (pct: number) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL('./gifWorker.ts', import.meta.url),
      { type: 'module' }
    );

    worker.postMessage({ graph, width: 1920, height: 1080, fps: 12, duration: 3 });

    worker.onmessage = (e) => {
      const msg = e.data as { type: string; pct?: number; buffer?: ArrayBuffer };

      if (msg.type === 'progress') {
        onProgress?.(msg.pct ?? 0);
        return;
      }

      if (msg.type === 'error') {
        worker.terminate();
        reject(new Error(msg.pct?.toString() ?? 'Worker error'));
        return;
      }

      if (msg.type === 'done' && msg.buffer) {
        worker.terminate();
        // Reconstruct Uint8Array from the transferred ArrayBuffer
        const u8 = new Uint8Array(msg.buffer);
        // Use image/gif so the file opens correctly when user double-clicks it
        const blob = new Blob([u8], { type: 'image/gif' });
        const url = URL.createObjectURL(blob);
        resolve(url);
      }
    };

    worker.onerror = (err) => {
      worker.terminate();
      reject(new Error(err.message ?? 'Worker failed'));
    };
  });
}
