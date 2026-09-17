export interface DiagramExample {
  name: string;
  description: string;
  source: string;
}

/** Curated examples shown on the landing page and covered by parser regressions. */
export const DIAGRAM_EXAMPLES: DiagramExample[] = [
  {
    name: 'Production API architecture',
    description:
      'Map traffic from a customer through edge security, services, data stores and monitoring.',
    source:
      'flowchart LR\nU((Customer)) --> CDN[DNS and CDN]\nCDN --> WAF[Web Application Firewall]\nWAF --> LB[Load Balancer]\nLB --> API[API Service]\nAPI --> AUTH[Identity Provider]\nAPI --> CACHE[/Redis Cache/]\nAPI --> DB[(PostgreSQL)]\nAPI -. logs .-> OBS[Monitoring]',
  },
  {
    name: 'Incident response',
    description:
      'Show how an on-call team triages an alert, mitigates impact and closes the review loop.',
    source:
      'flowchart TD\nA[Monitoring alert] --> B[On-call triage]\nB --> C{Customer impact?}\nC -->|High| D[Declare incident]\nC -->|Low| E[Create ticket]\nD --> F[Mitigate or rollback]\nF --> G{Service healthy?}\nG -->|No| B\nG -->|Yes| H[Post-incident review]\nE --> H',
  },
  {
    name: 'Secure CI/CD pipeline',
    description:
      'Follow a pull request through tests, security checks, staging, production and rollback.',
    source:
      'flowchart TD\nA[Pull request] --> B[Unit tests]\nB --> C[Security scan]\nC --> D{Checks pass?}\nD -->|No| E[Fix findings]\nE --> A\nD -->|Yes| F[Build container]\nF --> G[Deploy staging]\nG --> H{Smoke tests pass?}\nH -->|No| I[Rollback staging]\nH -->|Yes| J[Promote production]',
  },
];
