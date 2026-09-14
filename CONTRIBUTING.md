# Contributing

Use Node 24 and npm ci. Run npm run dev for local development.

Before submitting a change:

- Run npm run format, then npm run verify.
- Run npx playwright install chromium and npm run test:e2e.
- Run npm audit and review new dependency advisories.
- Add regression tests for changes to parsing, layout, model validation or exports.

Keep transport, validation, graph state and rendering separate. Do not accept
model-generated CSS or bypass parse validation to make a failing input render.
Preserve original topology during presentation styling. Add new graph semantics
to every renderer and the serialization tests together.

Use small, focused pull requests with the problem, behavior change, and test
evidence. Never commit keys, personal diagrams, generated dist files or test traces.
