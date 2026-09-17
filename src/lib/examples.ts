export interface DiagramExample {
  name: string;
  source: string;
}

/** Curated examples shown on the landing page and covered by parser regressions. */
export const DIAGRAM_EXAMPLES: DiagramExample[] = [
  {
    name: 'Request flow',
    source:
      'flowchart LR\nU((User)) --> API[API Gateway]\nAPI --> AUTH[Auth Service]\nAPI --> S[Product Service]\nS --> DB[(PostgreSQL)]\nS -.-> CACHE[/Redis/]',
  },
  {
    name: 'Decision loop',
    source:
      'flowchart TB\nA[Start] --> B{Is it working?}\nB -->|Yes| C[Ship it]\nB -->|No| D[Debug]\nD --> B',
  },
  {
    name: 'Delivery pipeline',
    source:
      'flowchart LR\nA[GitHub] --> B[Tests]\nB --> C{Pass?}\nC -->|Yes| D[Build container]\nD --> E[Deploy]\nC -->|No| F[Fix code]\nF --> A',
  },
];
