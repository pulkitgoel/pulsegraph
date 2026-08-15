# ⚡ PulseGraph

PulseGraph is a premium, chat-first architecture animation tool. It converts natural language descriptions—or complex raw Mermaid code—into high-fidelity, animated system diagrams with glowing data flows, nested clustering, and interactive panning and zooming.

## ✨ Key Features

- **Interactive Chat-Based Iteration**:
  - Converse directly with the AI in a side panel to incrementally add nodes, expand flows, or refine the layout step-by-step.
  
- **Dual View Canvas Modes**:
  - **Classic Mode**: Clean, simple lines, and basic node shapes.
  - **Rich Icons Mode**: Modern styling with custom SVG icons (AI agents, OAuth locks, search, cloud, databases, queues, caches, payments) and premium glassmorphism gradients and glowing effects.

- **Multi-Model AI Hub**:
  - **Local (Privacy First)**: Fully offline support using **Ollama** (recommended: `gemma3:4b`). Keep your sensitive enterprise architectures completely on your local machine.
  - **Cloud (High Capability)**: Support for **DeepSeek** cloud API for handling exceptionally complex logic.
  - Features an intuitive UI toggle to switch between providers/models seamlessly.
  
- **Deterministic Mermaid Parser** (`src/parser/mermaidParser.ts`):
  - A tokenizing parser that handles chained edges (`A --> B --> C`), multi-node shorthand (`A & B --> C`), both edge-label forms (`-->|x|` and `-- x -->`), open links (`---`), cross/circle arrowheads (`--x`, `--o`), dashed `-.->` paths, and **infinitely nested subgraphs** with HTML line breaks (`<br/>`).
  - Identical repeated edges are de-duplicated; anything the parser cannot understand is reported in `Graph.warnings` (surfaced in the chat) instead of silently producing garbage nodes.
  - Built over Dagre's compound **multigraph** layout, so parallel edges with different labels keep separate routes and parent groups precisely encapsulate their nested children without overlapping.

- **Interactive Glowing Canvas**:
  - **Pan & Zoom**: Fluid drag-to-pan and scroll-to-zoom functionality, equipped with UI-based zoom controls (In, Out, Reset).
  - **GSAP Animations**: Continuous micro-animations (spinning load balancers, database scans, pulse markers) and path-following flow animations that simulate live data travel.

- **✨ AI Presentation & ⬇ Export PNG** (two-step workflow):
  - **Step 1 — AI Presentation**: sends your current diagram to the LLM, which reinterprets it into a clean, *sectioned* architecture layout. The AI assigns every node a semantic **role** — `lead-in` (client/entry), `pipeline` (the core sequential stages), `service` (shared systems the pipeline calls, e.g. a database or an AI gateway), or `output` (terminal artifacts/reports) — and the animated canvas re-lays the diagram by role: entry nodes on the left, the pipeline in one row, services in a band below with dashed "call" edges, outputs stacked on the right.
  - **Step 2 — Export PNG** (enabled once Step 1 has run): renders the *same* role-based layout through a dedicated static SVG generator (`src/render/blueprintSvg.ts`) styled like a professional architecture slide — light theme, numbered pipeline stages, labeled zone boxes, color-coded service accents — and downloads it as a high-resolution PNG. This is intentionally a separate, static renderer: the clean "designed slide" look is a different aesthetic from the animated glassmorphism canvas, not just a style tweak on top of it.
  - The **Export PNG** button stays visible but disabled (with an explanatory tooltip) until Step 1 has produced roles for the current diagram — it never appears/disappears, so it's always clear what to do next.

- **Ultra-High-Resolution Exporter (PNG & GIF)**:
  - **Vector-Sharp 5.0x Scaling**: Renders vector-sharp text and borders at 5x target density (capping at 4096px for GIFs).
  - **Wrapper `<g>` Upscaling**: Sets root `viewBox` to exactly match the target output dimensions (`0 0 targetW targetH`). Scales all child elements internally inside a `<g>` wrapper to bypass browser-specific downscaling/stretching rasterization bugs.
  - **Export frame sizes**: choose how the canvas export is fitted — `fit to content` (tight crop, default), `16:9` / `16:10` / `4:3` (slide aspect ratios), `1:1` (square), or `A4 landscape/portrait` (documents). All use a uniform "contain" scale so the diagram is centred and never stretched.
  - **Main-Thread GIF Encoding**: Offloads encoding directly to the main thread (bypassing Web Worker caching and path resolution bugs) with regular micro-yields (`setTimeout(r, 0)`) to maintain UI responsiveness.
  - **Downsampled Quantization**: Implements a pixel downsampler (`getFastPalette`) that samples at most 10,000 pixels for palette generation, yielding a **100x speedup** (under 2ms) and eliminating encoding lags.
  - Native "Save As" capabilities via the File System Access API.

## 🛠 Tech Stack

- **Frontend**: React 19, TypeScript, Vite
- **Animations & Layout**: GSAP (MotionPathPlugin), Dagre (Compound Graphs)
- **AI Integration**: DeepSeek (Cloud), Ollama (Local)
- **GIF/PNG Rendering**: custom native SVG-to-canvas rendering with `gifenc` (main-thread execution)
- **Tests**: dependency-free `node:test` suite over the Mermaid parser, level computation, and CSS sanitizer — run with `npm test`

## 🚀 Getting Started

### 1. Installation

```bash
# Clone the repository
git clone <repo-url>
cd PulseGraph

# Install dependencies
npm install
```

### 2. Configuration & Model Setup

Upon launching the app, you will be prompted with the **Provider Configuration Hub**.

*   **For Cloud (DeepSeek)**: Enter your API key. (Saved securely to your browser's `localStorage`).
*   **For Local (Ollama)**: 
    1. Install [Ollama](https://ollama.com/).
    2. Pull the recommended model: `ollama pull gemma3:4b`.
    3. Ensure CORS is enabled for web browser access by setting the environment variable `OLLAMA_ORIGINS="*"` before starting the Ollama server.

### 3. Development

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## 📐 Node Type Mapping

PulseGraph parses Mermaid shape syntax to automatically assign beautiful icons and styling rules:

| Mermaid Syntax | Shape | Node Type |
|---|---|---|
| `A((Label))` | Circle | **User** |
| `A[(Label)]` | Cylinder | **Database** |
| `A[/Label/]` | Parallelogram | **Cache / Queue** |
| `A{Label}` | Diamond | **Gateway / Router** |
| `A[Label]` | Rectangle | **Service / Backend** |
| `A(Label)` | Rounded | **Client / Frontend** |

## 📁 Project Structure

- `src/services/llmService.ts`: Manages multi-model routing, prompt normalization, and the validation pipeline. Also holds the **AI Presentation** designer prompt (`DESIGN_PROMPT`) and `designPresentation()`, which asks the LLM to reinterpret a diagram and assign each node a layout `role`.
- `src/parser/mermaidParser.ts`: The recursive AST parser tracking deep subgraph nesting and syntactic edge cases.
- `src/parser/layoutEngine.ts`: Two layout strategies — `computeLayout()` (the default, automatic Dagre layout for every diagram) and `roleBlueprintLayout()` (positions nodes by their AI-assigned semantic role — lead-in / pipeline / service / output — for the AI Presentation view and PNG export).
- `src/render/blueprintSvg.ts`: `buildBlueprintSvg()` — a standalone, static SVG generator that renders a role-laid-out graph as a clean, presentation-quality architecture slide (light theme, numbered stages, zone boxes). Powers the **Export PNG** button; independent of the animated canvas renderers below.
- `src/components/DiagramCanvas.tsx`: SVG renderer handling GSAP animations, panning, zooming, and dynamic encapsulation boxes in Classic mode.
- `src/components/RichDiagramCanvas.tsx`: Modern SVG renderer utilizing custom inline SVG icons, glassmorphism filters, glows, and GSAP micro-animations.
- `src/services/gifExporter.ts`: Manages the main-thread high-resolution PNG and GIF exporting (including the export frame sizes above), inline font styling, and downsampled quantization.

## 📄 License

MIT
