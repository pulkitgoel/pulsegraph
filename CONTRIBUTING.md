# Contributing

Use Node 24 and npm ci. Run npm run dev for local development.

Before submitting a change:

- Run npm run format, then npm run verify.
- Run npx playwright install chromium and npm run test:e2e.
- Test the production build used by CI: after npm run build, set
  PLAYWRIGHT_PRODUCTION=1 and run npm run test:e2e. Run npm run test:pages
  for GitHub Pages asset paths.
- Run npm audit --audit-level=high and review new dependency advisories.
  Commit compatible dependency fixes in package-lock.json; do not bypass the audit.
- Add regression tests for changes to parsing, layout, model validation or exports.

Browser geometry assertions should wait for the requested mode and updated canvas
before measuring positions. Keep layout and connector-spacing requirements intact;
do not weaken them to accommodate a timing-sensitive read of the previous view.

Keep transport, validation, graph state and rendering separate. Do not accept
model-generated CSS or bypass parse validation to make a failing input render.
Preserve original topology during presentation styling. Add new graph semantics
to every renderer and the serialization tests together.

Use small, focused pull requests with the problem, behavior change, and test
evidence. Never commit keys, personal diagrams, generated dist files or test traces.
