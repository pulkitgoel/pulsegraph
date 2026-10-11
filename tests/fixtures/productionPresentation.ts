import { DIAGRAM_EXAMPLES } from '../../src/lib/examples';
import type { PresentationPlan } from '../../src/lib/presentationPlan';

export const PRODUCTION_FLOW = DIAGRAM_EXAMPLES[0].source;
export const PRODUCTION_ROLES = {
  U: 'lead-in',
  CDN: 'pipeline',
  WAF: 'pipeline',
  LB: 'pipeline',
  API: 'pipeline',
  AUTH: 'service',
  CACHE: 'service',
  DB: 'service',
  OBS: 'service',
};

// A valid representative AI plan; the API fans out to four dependencies.
export const PRODUCTION_PRESENTATION: PresentationPlan = {
  title: 'Production API architecture',
  mainPath: ['U', 'CDN', 'WAF', 'LB', 'API'],
  lanes: [
    {
      title: 'Request journey',
      kind: 'journey',
      nodeIds: ['U', 'CDN', 'WAF', 'LB', 'API'],
    },
    {
      title: 'Supporting systems',
      kind: 'support',
      nodeIds: ['AUTH', 'CACHE', 'DB', 'OBS'],
    },
  ],
};
