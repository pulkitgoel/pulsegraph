import type { PresentationPlan } from '../../src/lib/presentationPlan';

export const NOVATION_FLOW = `flowchart TD
    A["Employee selects benefit"] --> B["Employee adds benefit and goes to checkout"]
    B --> C{"Does benefit require Novation Agreement e-signature?"}
    C -->|No| D["Continue normal checkout"]
    C -->|Yes| E["Darwin generates Novation Agreement"]
    E --> F["Darwin sends agreement to DocuSign"]
    F --> G["Employee reviews agreement in DocuSign"]
    G --> H{"Employee action"}
    H -->|Sign completed| I["DocuSign returns signed status to Darwin"]
    I --> J["Darwin stores latest signed agreement"]
    J --> K["Success screen: Agreement signed successfully"]
    K --> L["Employee continues / completes benefit order"]
    H -->|"Window closed / abandoned"| M["Agreement remains unsigned / pending"]
    M --> N["Employee returns later to Darwin"]
    N --> O["Darwin shows: Action required — Sign your Novation Agreement"]
    O --> P["Employee clicks Sign again"]
    H -->|Decline| Q["DocuSign returns declined status to Darwin"]
    Q --> R["Darwin shows message: You have declined the required agreement. Your benefit order cannot be completed until the agreement is signed."]
    R --> S["Prevent order completion"]
    S --> P
    P --> F`;

// Representative composition metadata; the source graph remains unchanged.
export const NOVATION_PRESENTATION: PresentationPlan = {
  title: 'Benefit checkout and agreement signing',
  mainPath: ['A', 'B', 'C', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'],
  lanes: [
    {
      title: 'Checkout and signature request',
      kind: 'journey',
      nodeIds: ['A', 'B', 'C', 'D', 'E', 'F', 'G'],
    },
    { title: 'Signature completed', kind: 'journey', nodeIds: ['H', 'I', 'J', 'K', 'L'] },
    {
      title: 'Pending, declined and retry',
      kind: 'support',
      nodeIds: ['M', 'N', 'O', 'P', 'Q', 'R', 'S'],
    },
  ],
};

export const NOVATION_ROLES = Object.fromEntries(
  NOVATION_PRESENTATION.lanes.flatMap((lane) =>
    lane.nodeIds.map((id) => [id, 'pipeline']),
  ),
);
