import { useCallback, useEffect, useRef, useState } from 'react';

export function useCanvasViewport(width: number, height: number) {
  const containerRef = useRef<HTMLDivElement>(null);
  const transformContainerRef = useRef<HTMLDivElement>(null);
  const transform = useRef({ scale: 1, x: 0, y: 0 });
  const pointer = useRef<{ id: number; x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const apply = useCallback(() => {
    const { x, y, scale } = transform.current;
    if (transformContainerRef.current) {
      transformContainerRef.current.style.transform =
        'translate(' + x + 'px,' + y + 'px) scale(' + scale + ')';
    }
  }, []);

  const fit = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const scale = Math.max(
      0.01,
      Math.min(
        (container.clientWidth - 48) / width,
        (container.clientHeight - 48) / height,
        2,
      ),
    );
    transform.current = {
      scale,
      x: (container.clientWidth - width * scale) / 2,
      y: (container.clientHeight - height * scale) / 2,
    };
    apply();
  }, [width, height, apply]);

  const zoom = useCallback(
    (factor: number, x?: number, y?: number) => {
      const container = containerRef.current;
      if (!container) return;
      const previous = transform.current;
      const scale = Math.min(4, Math.max(0.01, previous.scale * factor));
      const anchorX = x ?? container.clientWidth / 2;
      const anchorY = y ?? container.clientHeight / 2;
      transform.current = {
        scale,
        x: anchorX - ((anchorX - previous.x) * scale) / previous.scale,
        y: anchorY - ((anchorY - previous.y) * scale) / previous.scale,
      };
      apply();
    },
    [apply],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(fit);
    observer.observe(container);
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = container.getBoundingClientRect();
      zoom(
        Math.exp(-event.deltaY * 0.0015),
        event.clientX - rect.left,
        event.clientY - rect.top,
      );
    };
    container.addEventListener('wheel', wheel, { passive: false });
    return () => {
      observer.disconnect();
      container.removeEventListener('wheel', wheel);
    };
  }, [fit, zoom]);

  function handleMouseDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || (event.target as Element).closest('button')) return;
    pointer.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsDragging(true);
  }

  function handleMouseMove(event: React.PointerEvent<HTMLDivElement>) {
    const previous = pointer.current;
    if (!previous || previous.id !== event.pointerId) return;
    transform.current.x += event.clientX - previous.x;
    transform.current.y += event.clientY - previous.y;
    pointer.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
    apply();
  }

  function handleMouseUp() {
    pointer.current = null;
    setIsDragging(false);
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.target !== event.currentTarget) return;
    if (event.key === '+' || event.key === '=') zoom(1.2);
    else if (event.key === '-') zoom(1 / 1.2);
    else if (event.key === '0') fit();
    else if (event.key.startsWith('Arrow')) {
      transform.current.x +=
        event.key === 'ArrowLeft' ? 40 : event.key === 'ArrowRight' ? -40 : 0;
      transform.current.y +=
        event.key === 'ArrowUp' ? 40 : event.key === 'ArrowDown' ? -40 : 0;
      apply();
    } else return;
    event.preventDefault();
  }

  return {
    containerRef,
    transformContainerRef,
    isDragging,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleKeyDown,
    handleZoomIn: () => zoom(1.2),
    handleZoomOut: () => zoom(1 / 1.2),
    handleZoomReset: fit,
  };
}
