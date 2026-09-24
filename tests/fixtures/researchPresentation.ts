import type { PresentationPlan } from '../../src/lib/presentationPlan';

export const RESEARCH_ROLES = {
  User: 'lead-in',
  API: 'pipeline',
  SEC: 'pipeline',
  Q: 'pipeline',
  W: 'pipeline',
  C: 'service',
  L: 'service',
  A1: 'pipeline',
  A2: 'pipeline',
  A3: 'pipeline',
  A4: 'pipeline',
  TZ: 'service',
  GO: 'pipeline',
  S: 'service',
  RES: 'output',
  POLL: 'output',
};
// A representative AI response, not production special-casing of this diagram.
export const RESEARCH_PRESENTATION: PresentationPlan = {
  title: 'Research request — from question to report',
  mainPath: [
    'User',
    'API',
    'SEC',
    'Q',
    'W',
    'C',
    'L',
    'A1',
    'A2',
    'A3',
    'A4',
    'GO',
    'S',
    'RES',
    'POLL',
  ],
  lanes: [
    {
      title: 'Request intake & fast paths',
      kind: 'journey',
      nodeIds: ['User', 'API', 'SEC', 'Q', 'W', 'C', 'L'],
    },
    {
      title: 'LangGraph Multi-Agent Pipeline',
      kind: 'journey',
      nodeIds: ['A1', 'A2', 'A3', 'A4'],
    },
    {
      title: 'Model gateway, delivery & results',
      kind: 'support',
      nodeIds: ['TZ', 'GO', 'S', 'RES', 'POLL'],
    },
  ],
};
