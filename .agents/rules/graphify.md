---
trigger: always_on
description: Consult the local Graphify knowledge graph for codebase and architecture questions.
---

# Graphify

- When `graphify-out/graph.json` exists, query it before broad architecture searches.
- Use `graphify query "<question>"`, `graphify path "<A>" "<B>"`, or
  `graphify explain "<concept>"` for focused exploration.
- After changing code, run `graphify update .` from the repository root.
- Keep `graphify-out/` local; it is generated and ignored by Git.
