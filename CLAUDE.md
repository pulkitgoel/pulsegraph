# PulseGraph — project notes for future sessions

Chat-first tool that turns Mermaid / plain-English descriptions into animated
architecture diagrams (React 19 + Vite + Dagre + GSAP), with PNG/GIF export.

## Layout engines — don't confuse these

`src/parser/layoutEngine.ts` has **two** layout strategies. Know which one a
change affects before editing:

- `computeLayout(graph)` — the **default** automatic layout (Dagre). Used for
  every diagram the user generates via chat. Purely topological: it does not
  know what a node *means*, only how it connects.
- `roleBlueprintLayout(graph, roles)` — a **semantic** layout used only after
  **✨ AI Presentation** runs. It places nodes by their AI-assigned `role`
  (`lead-in` / `pipeline` / `service` / `output`) into a hand-designed-looking
  grid: entry nodes left, pipeline in one row, services in a band below with
  dashed edges, outputs stacked right, each in a labeled zone box.

There used to be a third, purely-topological "Blueprint" grid layout with a
manual Auto/Blueprint toggle in the header. **It was removed on 2026-07-10** —
it produced a symmetric grid but with no understanding of node meaning, so
long flows still looked arbitrary (branches split mid-pipeline, snake-ordered
rows). Do not re-add a manual layout toggle; if the auto layout isn't good
enough for a case, prefer improving `computeLayout` or the role system, not
adding another user-facing mode to choose between.

## AI Presentation → Export PNG (two-step feature)

This is the flow for getting a professional, slide-quality diagram:

1. **✨ AI Presentation** (`handleDesignPresentation` in `App.tsx`) calls
   `designPresentation()` in `llmService.ts`, which sends the `DESIGN_PROMPT`
   to the LLM. The prompt requires the model to return a `roles` map (every
   node id → one of the four roles above) alongside the redesigned Mermaid.
   The app then lays out the graph with `roleBlueprintLayout` and stores the
   roles in `presentationRoles` state.
2. **⬇ Export PNG** (`handleExportBlueprint`) is only meaningful once
   `presentationRoles` exists for the *current* graph — it re-runs
   `roleBlueprintLayout` and feeds the result to `buildBlueprintSvg()`
   (`src/render/blueprintSvg.ts`), a completely separate static SVG renderer
   that draws the clean, light-theme "architecture slide" look (numbered
   pipeline stages, zone boxes, service accent bars). It is rasterized to a
   2x PNG via an offscreen `<canvas>` and downloaded.

Why two renderers exist: the animated Rich/Classic canvas (glassmorphism,
glow, icons) and the clean slide look are different aesthetics, not the same
renderer with a style flag. Getting the professional look required a
dedicated static SVG generator — see the design-agent conversation history
(2026-07-09/10) if you need the reasoning trail.

**UX rule**: the blueprint export ("Slide PNG") must always be visible once a
graph exists, `disabled` (not hidden) until `presentationRoles` is set, with a
tooltip explaining why. Do not make it appear/disappear — that was a source
of user confusion before the 2026-07-10 simplification.
**2026-08-16 header cleanup**: all exports now live in one "⬇ Export" dropdown
in the header (PNG / GIF / Slide PNG + frame-size select). The Slide PNG menu
item follows the same disabled-not-hidden rule. Do not re-add separate export
buttons to the chat panel or header — two different "Export PNG" buttons at
once was the confusion this fixed.

**Stale-roles gotcha**: `presentationRoles` must be reset to `null` whenever
a *new* diagram is generated via chat (`submitMessage`) — otherwise Export
PNG would render leftover roles from a previous, structurally different
graph. This reset already exists in `submitMessage`; preserve it if you
refactor that function.

## Verifying layout/SVG changes without a browser session

When changing `layoutEngine.ts` or `blueprintSvg.ts`, you can validate
geometry headlessly instead of guessing:

```bash
cat > _check.mts <<'EOF'
import { roleBlueprintLayout, getGraphDimensions } from './src/parser/layoutEngine.ts';
// build a small nodes/edges/roles fixture, call the function, log dims/positions
EOF
npx tsx _check.mts
```

To actually *see* rendered output, wrap an SVG string in a minimal HTML file
and screenshot it with headless Chrome (adjust the Chrome path for the
machine):

```bash
printf '%s' '<!doctype html><html><body style="margin:0"><img src="_out.svg" width="W" height="H"></body></html>' > _w.html
"/c/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --disable-gpu \
  --force-device-scale-factor=2 --screenshot="_out.png" --window-size=W,H "file:///.../_w.html"
```

Read the resulting PNG back before telling the user it works. Delete `_check.mts` / `_w.html` / the temp SVG/PNG afterward — they're scratch files, not build artifacts.

## Dev server gotcha

Vite dev servers left running from earlier sessions do **not** always
hot-reload cleanly across a long session (observed: a server running since
before an edit silently kept serving stale code). If the user reports "I
don't see my changes" after a build succeeds, check `netstat` for the port
they're on, confirm the process start time predates your edits, and restart
that specific server rather than assuming the code is wrong. Prefer killing
and restarting on the **same port** the user already has open, rather than
leaving them to switch URLs.

## Node role model (four values only)

`NodeRole = 'lead-in' | 'pipeline' | 'service' | 'output'` (defined in
`layoutEngine.ts`). If you extend the role system (e.g. a `data-store` role
distinct from generic `service`), update in lockstep:
- `DESIGN_PROMPT` in `llmService.ts` (the enum the LLM is told to use)
- `roleBlueprintLayout()`'s `roleOf()` guard and placement logic
- `blueprintSvg.ts`'s `roleOf()` fallback and per-role styling
