import type { Graph } from '../types';
import { validateAiPresentationPlan, type PresentationPlan } from './presentationPlan';
import { presentationLayout } from './presentationLayout';
import { compareLayoutQuality, inspectLayout, type LayoutQuality } from './layoutQuality';
import type { PresentationIconBounds } from './presentationIcon';

/** All candidates are checked locally; choosing one never makes another AI call. */
export function selectPresentation(
  graph: Graph,
  proposals: unknown[],
  iconBounds?: Record<string, PresentationIconBounds>,
): PresentationPlan {
  if (!proposals.length || proposals.length > 3) {
    throw new Error('The AI must return one to three presentation choices.');
  }
  let best: { plan: PresentationPlan; quality: LayoutQuality } | undefined;
  let readingPath: string | undefined;
  for (const proposal of proposals) {
    try {
      const plan = validateAiPresentationPlan(proposal, graph);
      // Compare arrangements of the same reading path, rather than rewarding
      // a candidate that deletes the main journey to obtain fewer bends.
      const path = JSON.stringify({
        mainPath: plan.mainPath,
        sections: plan.lanes
          .map((lane) => `${lane.kind}:${[...lane.nodeIds].sort().join(',')}`)
          .sort(),
      });
      if (readingPath && path !== readingPath) continue;
      readingPath = path;
      const scene = presentationLayout(graph, plan, iconBounds);
      const quality = inspectLayout(scene.graph, false);
      if (quality.cost[0] || quality.cost[1]) continue;
      if (!best || compareLayoutQuality(quality, best.quality) < 0)
        best = { plan, quality };
    } catch {
      // A malformed or unroutable choice cannot replace the current document.
    }
  }
  if (!best) {
    throw new Error(
      'The AI could not produce a valid, readable presentation. Your current diagram has been kept. Try Recompose with AI or edit the source.',
    );
  }
  return best.plan;
}
