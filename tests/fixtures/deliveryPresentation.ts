import { DIAGRAM_EXAMPLES } from '../../src/lib/examples';
import type { PresentationPlan } from '../../src/lib/presentationPlan';

export const DELIVERY_FLOW = DIAGRAM_EXAMPLES.find(
  (example) => example.name === 'Secure CI/CD pipeline',
)!.source;
export const DELIVERY_ROLES = {
  A: 'lead-in',
  B: 'pipeline',
  C: 'pipeline',
  D: 'pipeline',
  E: 'pipeline',
  F: 'pipeline',
  G: 'pipeline',
  H: 'pipeline',
  I: 'pipeline',
  J: 'output',
};

// A representative valid AI composition, not a captured provider response.
export const DELIVERY_PRESENTATION: PresentationPlan = {
  title: 'Secure CI/CD pipeline',
  mainPath: ['A', 'B', 'C', 'D', 'F', 'G', 'H', 'J'],
  lanes: [
    {
      title: 'Delivery journey',
      kind: 'journey',
      nodeIds: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'],
    },
  ],
};
