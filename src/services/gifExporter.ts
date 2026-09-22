import { exportGeometry, type ExportFrame } from './exportGeometry';
import { pulseTravelDistanceAtTime, pulseTravelWindow } from '../lib/pulseTravel';
export type { ExportFrame } from './exportGeometry';

const SVG_NS = 'http://www.w3.org/2000/svg';
const GIF_FRAME_DELAY_MS = 70;
type Progress = (percent: number) => void;

function safePathLength(path: SVGPathElement | null): number {
  if (!path) return 0;
  try {
    return path.getTotalLength();
  } catch {
    return 0;
  }
}

function flowSegmentMetrics(length: number) {
  const segment = Math.min(42, Math.max(18, length * 0.14));
  const pulseWindow = pulseTravelWindow(length);
  return {
    dasharray: `${segment} ${Math.max(1, length - segment)}`,
    dashoffset: String(-(length * 0.35 + pulseWindow.inset * 0.15)),
  };
}

/** Export a settled snapshot. Never mutate the live canvas or GSAP timeline. */
function snapshot(element: Element): SVGSVGElement {
  const flowStyle = element.getAttribute('data-visual-style') === 'flow';
  const clone = element.cloneNode(true) as SVGSVGElement;
  clone.removeAttribute('style');
  clone
    .querySelectorAll('style, script, foreignObject, [id^="glow-"]')
    .forEach((node) => node.remove());
  if (!flowStyle)
    clone.querySelectorAll('[id^="pulse-"]').forEach((node) => node.remove());
  clone.querySelectorAll<SVGElement>('.node-group, [id^="group-"]').forEach((node) => {
    node.style.removeProperty('transform');
    node.style.opacity = '1';
    if (node.classList.contains('node-group')) node.removeAttribute('transform');
  });
  clone.querySelectorAll<SVGPathElement>('[id^="path-"]').forEach((path) => {
    const savedMarker = path.getAttribute('data-marker-end');
    if (savedMarker) path.setAttribute('marker-end', savedMarker);
    path.style.strokeDasharray =
      path.getAttribute('data-dashed') === 'true' ? '6 6' : 'none';
    path.style.strokeDashoffset = '0';
    path.style.opacity = '1';
  });
  if (flowStyle) {
    clone.querySelectorAll<SVGPathElement>('.flow-segment').forEach((segment) => {
      const sourcePath = element.querySelector<SVGPathElement>(
        `#path-${segment.id.slice('pulse-'.length)}`,
      );
      const metrics = flowSegmentMetrics(safePathLength(sourcePath));
      segment.style.removeProperty('stroke-dasharray');
      segment.style.removeProperty('stroke-dashoffset');
      segment.style.removeProperty('opacity');
      segment.setAttribute('stroke-dasharray', metrics.dasharray);
      segment.setAttribute('stroke-dashoffset', metrics.dashoffset);
      segment.setAttribute('opacity', '1');
    });
  }
  return clone;
}

export function snapshotSvg(element: Element): string {
  return new XMLSerializer().serializeToString(snapshot(element));
}

function frameSvg(clone: SVGSVGElement, frame: ExportFrame, maxDimension: number) {
  const geometry = exportGeometry(
    Number(clone.getAttribute('width')),
    Number(clone.getAttribute('height')),
    frame,
    maxDimension,
  );
  const root = document.createElementNS(SVG_NS, 'svg');
  root.setAttribute('width', String(geometry.width));
  root.setAttribute('height', String(geometry.height));
  root.setAttribute('viewBox', '0 0 ' + geometry.width + ' ' + geometry.height);
  const group = document.createElementNS(SVG_NS, 'g');
  group.setAttribute('transform', geometry.transform);
  while (clone.firstChild) group.appendChild(clone.firstChild);
  root.appendChild(group);
  return { root, ...geometry };
}

async function rasterize(
  svg: SVGSVGElement,
  width: number,
  height: number,
  background: string,
  signal?: AbortSignal,
): Promise<HTMLCanvasElement> {
  signal?.throwIfAborted();
  const url = URL.createObjectURL(
    new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }),
  );
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      const abort = () => {
        image.src = '';
        reject(new DOMException('Cancelled', 'AbortError'));
      };
      signal?.addEventListener('abort', abort, { once: true });
      image.onload = () => {
        signal?.removeEventListener('abort', abort);
        resolve();
      };
      image.onerror = () => {
        signal?.removeEventListener('abort', abort);
        reject(new Error('Could not rasterize SVG.'));
      };
      image.src = url;
    });
    signal?.throwIfAborted();
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas is unavailable.');
    context.fillStyle = background;
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function exportPng(
  element: Element,
  theme: 'dark' | 'light',
  onProgress?: Progress,
  frame: ExportFrame = 'auto',
  signal?: AbortSignal,
): Promise<Blob> {
  onProgress?.(10);
  const { root, width, height } = frameSvg(snapshot(element), frame, 2560);
  const canvas = await rasterize(
    root,
    width,
    height,
    theme === 'light' ? '#F8FAFC' : '#090B10',
    signal,
  );
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (value) => (value ? resolve(value) : reject(new Error('PNG encoding failed.'))),
      'image/png',
    );
  });
  signal?.throwIfAborted();
  onProgress?.(100);
  return blob;
}

interface WorkerReply {
  type: 'ready' | 'done' | 'error';
  bytes?: Uint8Array<ArrayBuffer>;
  message?: string;
}

function sendFrame(
  worker: Worker,
  data: unknown,
  transfer: Transferable[],
  signal?: AbortSignal,
): Promise<WorkerReply> {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      worker.removeEventListener('message', receive);
      worker.removeEventListener('error', fail);
      signal?.removeEventListener('abort', abort);
    };
    const receive = (event: MessageEvent<WorkerReply>) => {
      cleanup();
      if (event.data.type === 'error') reject(new Error(event.data.message));
      else resolve(event.data);
    };
    const fail = () => {
      cleanup();
      reject(new Error('The GIF worker failed.'));
    };
    const abort = () => {
      cleanup();
      reject(new DOMException('Cancelled', 'AbortError'));
    };
    worker.addEventListener('message', receive);
    worker.addEventListener('error', fail);
    signal?.addEventListener('abort', abort, { once: true });
    worker.postMessage(data, transfer);
  });
}

/**
 * A deterministic loop of moving flow markers over a fixed snapshot.
 * Encoding runs off the UI thread, one transferred frame at a time.
 */
export async function exportGif(
  element: Element,
  theme: 'dark' | 'light',
  duration = 3,
  onProgress?: Progress,
  frame: ExportFrame = 'auto',
  signal?: AbortSignal,
): Promise<Blob> {
  const clone = snapshot(element);
  const flowStyle = clone.getAttribute('data-visual-style') === 'flow';
  clone.querySelectorAll('[filter]').forEach((node) => node.removeAttribute('filter'));
  const paths = Array.from(clone.querySelectorAll<SVGPathElement>('[id^="path-"]'));
  const flows = paths.map((path) => {
    const sourcePath = element.querySelector<SVGPathElement>(`#${path.id}`);
    const length = safePathLength(sourcePath) || safePathLength(path);
    if (flowStyle) {
      const segment = clone.querySelector<SVGPathElement>(
        `#pulse-${path.id.slice('path-'.length)}`,
      );
      if (!segment) throw new Error('Flow animation is unavailable for this edge.');
      const metrics = flowSegmentMetrics(length);
      const pulseWindow = pulseTravelWindow(length);
      segment.setAttribute('stroke-dasharray', metrics.dasharray);
      segment.setAttribute('opacity', '1');
      return {
        kind: 'segment' as const,
        segment,
        length,
        startOffset: -(length * pulseWindow.start),
        endOffset: -(length * pulseWindow.end),
      };
    }
    const circle = document.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('r', '5');
    const edgeId = path.id.slice('path-'.length);
    const livePulse = element.querySelector<SVGElement>(`#pulse-${edgeId}`);
    circle.setAttribute(
      'fill',
      livePulse?.getAttribute('fill') || (theme === 'light' ? '#475569' : '#94A3B8'),
    );
    // Keep the animated marker below the edge-label group so short tags such
    // as Yes and No remain readable in every exported frame.
    path.parentNode?.insertBefore(circle, path.nextSibling);
    return { kind: 'marker' as const, path, circle, length };
  });
  // Full-resolution GIFs remain crisp in presentations and social posts. Frames
  // are transferred to the worker one at a time, limiting main-thread memory.
  const { root, width, height } = frameSvg(clone, frame, 2560);
  const worker = new Worker(new URL('./gif.worker.ts', import.meta.url), {
    type: 'module',
  });
  const frameCount = Math.round(Math.min(6, Math.max(1, duration)) * 15);
  try {
    for (let index = 0; index < frameCount; index++) {
      signal?.throwIfAborted();
      const elapsedSeconds = (index * GIF_FRAME_DELAY_MS) / 1000;
      const fadeFrames = 3;
      const loopOpacity = Math.min(
        1,
        index / fadeFrames,
        (frameCount - 1 - index) / fadeFrames,
      );
      flows.forEach((flow) => {
        const distance = pulseTravelDistanceAtTime(flow.length, elapsedSeconds);
        if (flow.kind === 'segment') {
          flow.segment.setAttribute('stroke-dashoffset', String(-distance));
          flow.segment.setAttribute('opacity', String(loopOpacity));
          return;
        }
        const point = flow.path.getPointAtLength(distance);
        flow.circle.setAttribute('cx', String(point.x));
        flow.circle.setAttribute('cy', String(point.y));
        flow.circle.setAttribute('opacity', String(loopOpacity));
      });
      const canvas = await rasterize(
        root,
        width,
        height,
        theme === 'light' ? '#F8FAFC' : '#090B10',
        signal,
      );
      const pixels = canvas.getContext('2d')!.getImageData(0, 0, width, height).data;
      await sendFrame(
        worker,
        {
          type: 'frame',
          pixels: pixels.buffer,
          width,
          height,
          delay: GIF_FRAME_DELAY_MS,
        },
        [pixels.buffer],
        signal,
      );
      onProgress?.(Math.round(((index + 1) / frameCount) * 95));
    }
    const result = await sendFrame(worker, { type: 'finish' }, [], signal);
    if (!result.bytes) throw new Error('GIF encoder returned no output.');
    onProgress?.(100);
    return new Blob([result.bytes], { type: 'image/gif' });
  } finally {
    worker.terminate();
  }
}
