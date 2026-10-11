import type { GraphNode } from '../types';

export const PRESENTATION_ICON = { x: 47, y: 16, scale: 2.15 };
export interface PresentationIconBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Glyph bounds are relative to the node, separately from the label below it. */
export function presentationIconBox(node: GraphNode, bounds?: PresentationIconBounds) {
  const icon = bounds ?? { x: 47, y: 18, width: 56, height: 56 };
  const left = node.x! - node.width / 2 + icon.x;
  const top = node.y! - node.height / 2 + icon.y;
  return { left, top, right: left + icon.width, bottom: top + icon.height };
}
