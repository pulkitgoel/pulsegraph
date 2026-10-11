import { createRoot } from 'react-dom/client';
import type { Graph } from '../types';
import { PRESENTATION_ICON, type PresentationIconBounds } from '../lib/presentationIcon';
import { RichNodeIcon } from './RichDiagramCanvas';

export function readPresentationIconBounds(
  svg: SVGSVGElement,
): Record<string, PresentationIconBounds> {
  const bounds: Record<string, PresentationIconBounds> = {};
  svg.querySelectorAll<SVGGElement>('[data-icon-measure]').forEach((icon) => {
    const box = icon.getBBox();
    bounds[icon.getAttribute('data-icon-measure')!] = {
      x: PRESENTATION_ICON.x + box.x * PRESENTATION_ICON.scale,
      y: PRESENTATION_ICON.y + box.y * PRESENTATION_ICON.scale,
      width: box.width * PRESENTATION_ICON.scale,
      height: box.height * PRESENTATION_ICON.scale,
    };
  });
  return bounds;
}

/** Measure the exact glyphs before AI choices are checked or committed. */
export async function measurePresentationIcons(
  graph: Graph,
): Promise<Record<string, PresentationIconBounds>> {
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText =
    'position:absolute;visibility:hidden;width:0;height:0;overflow:hidden;pointer-events:none';
  document.body.append(host);
  const root = createRoot(host);
  try {
    return await new Promise((resolve, reject) => {
      root.render(
        <svg
          width="0"
          height="0"
          ref={(svg) => {
            if (!svg) return;
            try {
              resolve(readPresentationIconBounds(svg));
            } catch (error) {
              reject(error);
            }
          }}
        >
          {graph.nodes.map((node) => (
            <g key={node.id} data-icon-measure={node.id}>
              <RichNodeIcon type={node.type} label={node.label} />
            </g>
          ))}
        </svg>,
      );
    });
  } finally {
    root.unmount();
    host.remove();
  }
}
