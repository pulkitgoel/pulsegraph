import type { PresentationPlan } from '../../src/lib/presentationPlan';

export const INCIDENT_FLOW = `flowchart TD
A[Monitoring alert] --> B[On-call triage]
B --> C{Customer impact?}
C -->|High| D[Declare incident]
C -->|Low| E[Create ticket]
D --> F[Mitigate or rollback]
F --> G{Service healthy?}
G -->|No| B
G -->|Yes| H[Post-incident review]
E --> H`;

export const INCIDENT_PRESENTATION: PresentationPlan = {
  title: 'Incident response',
  mainPath: ['A', 'B', 'C', 'D', 'F', 'G', 'H'],
  lanes: [
    {
      title: 'Incident response',
      kind: 'journey',
      nodeIds: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
    },
  ],
};
export const INCIDENT_ROLES = Object.fromEntries(
  INCIDENT_PRESENTATION.lanes[0].nodeIds.map((id) => [id, 'pipeline']),
);
