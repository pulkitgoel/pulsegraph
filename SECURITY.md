# Security policy

Report suspected vulnerabilities privately through the repository's GitHub
**Security → Report a vulnerability** feature when available. Do not put API keys,
private diagrams, or exploit details in public issues. If private reporting is
not enabled, ask the maintainer for a private contact without disclosing details.

PulseGraph sends cloud requests directly to DeepSeek only when you use an AI
feature. API keys are held in memory and cleared on reload. Local Mermaid editing,
rendering and exports require no cloud API. Ollama requests use localhost:11434.
There are no external fonts, analytics, or telemetry.

Draft source and presentation roles are stored in this browser's localStorage.
Do not use a shared browser profile for confidential drafts. Clearing site data
removes drafts and preferences. Export a document before clearing data.

Model-authored CSS, HTML and executable scripts are not accepted. Presentation
AI proposes roles, section membership and a reading path; the application retains
every original node, label and edge and calculates coordinates itself. Validation
rejects missing/unknown nodes, invented connections and ambiguous group membership.
Only unambiguous closing-path and dedicated source-group duplicates in live AI
responses are normalized before strict validation. Imported and stored plans are
validated strictly without that normalization. Ordinary AI edits may intentionally
change topology and can be undone.

Limits: 30,000 source characters, 100 nodes, 300 edges, 100 KB document import,
200 KB AI response, 60-second cloud / 180-second local timeout. GIFs and PNGs are
limited to a 2,560-pixel long edge; GIFs use a 45-frame loop of about 3.15 seconds.

Use the pinned supported Node runtime and run npm run verify, npm run test:e2e,
and npm audit --audit-level=high before releases. Install the committed dependency
lockfile with npm ci and include compatible security updates in that lockfile.
Never expose a development server to untrusted
networks. Host the production dist directory over HTTPS. Add a server
Content-Security-Policy header with frame-ancestors 'none' and appropriate
connect-src restrictions; frame-ancestors cannot be enforced by HTML metadata.
