export const BENEFIT_FLOW = `flowchart TD
A[Employee selects benefit] --> B[Employee adds benefit and goes to checkout]
B --> C{Does benefit require Novation Agreement e-signature?}
C -->|No| D[Continue normal checkout]
C -->|Yes| E[Darwin generates Novation Agreement]
E --> F[Darwin sends agreement to DocuSign]
F --> G[Employee reviews agreement in DocuSign]
G --> H{Employee action}
H -->|Decline| I[DocuSign returns declined status to Darwin]
I --> J[Darwin shows message: You have declined the required agreement. Your benefit order cannot be completed until the agreement is signed.]
J --> K[Prevent order completion]
K --> L[Employee clicks Sign again]
H -->|Window closed / abandoned| M[Agreement remains unsigned / pending]
M --> N[Employee returns later to Darwin]
N --> O[Darwin shows: Action required — Sign your Novation Agreement]
O --> L
H -->|Sign completed| P[DocuSign returns signed status to Darwin]
P --> Q[Darwin stores latest signed agreement]
Q --> R[Success screen: Agreement signed successfully]
R --> S[Employee continues / completes benefit order]
L --> F`;
