# ⚡ PulseGraph

PulseGraph is a premium, chat-first architecture animation tool. It converts natural language descriptions—or complex raw Mermaid code—into high-fidelity, animated system diagrams with glowing data flows, nested clustering, and interactive panning and zooming.

## ✨ Key Features

- **Multi-Model AI Hub**:
  - **Local (Privacy First)**: Fully offline support using **Ollama** (recommended: `gemma3:4b`). Keep your sensitive enterprise architectures completely on your local machine.
  - **Cloud (High Capability)**: Support for **DeepSeek** cloud API for handling exceptionally complex logic.
  - Features an intuitive UI toggle to switch between models seamlessly.
  
- **Universal Lexer Engine & AST Parser**:
  - A robust, custom recursive parser that maps complex Mermaid syntax to a highly interactive UI.
  - Supports **infinitely nested subgraphs**, HTML line breaks (`<br/>`), and various arrow pathings (e.g., dashed `-.->` paths).
  - Built over Dagre's compound layout engine, ensuring parent groups precisely encapsulate their nested children without overlapping.

- **Intelligent LLM Normalization**:
  - **Two-Pass Pipeline**: Converts intent to raw syntax (Pass 1) and critically validates logical gaps (Pass 2).
  - Regardless of user input (e.g., asking for a Sequence Diagram or Mindmap), the LLM dynamically translates the architecture into a sophisticated, beautifully routed flowchart optimized for the PulseGraph canvas.

- **Interactive Glowing Canvas**:
  - **Pan & Zoom**: Fluid drag-to-pan and scroll-to-zoom functionality, equipped with UI-based zoom controls (In, Out, Reset).
  - **GSAP Animations**: Glowing pulse dots travel along SVG bezier paths to simulate live data flow across your system.

- **Professional GIF Export**:
  - High Definition 1280×720 (720p) output.
  - Offloaded to a Web Worker (`gifenc`) to prevent UI blocking while capturing smooth, animated motion.
  - Native "Save As" capabilities via the File System Access API.

## 🛠 Tech Stack

- **Frontend**: React 18, TypeScript, Vite
- **Animations & Layout**: GSAP (MotionPathPlugin), Dagre (Compound Graphs)
- **AI Integration**: DeepSeek (Cloud), Ollama (Local)
- **GIF Encoding**: `gifenc` (Web Worker)

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

- `src/services/llmService.ts`: Manages multi-model routing, prompt normalization, and the validation pipeline.
- `src/parser/mermaidParser.ts`: The recursive AST parser tracking deep subgraph nesting and syntactic edge cases.
- `src/parser/layoutEngine.ts`: Calculates node, edge, and compound cluster bounds using Dagre.
- `src/components/DiagramCanvas.tsx`: SVG renderer handling GSAP animations, panning, zooming, and dynamic encapsulation boxes.
- `src/services/gifWorker.ts`: High-resolution GIF encoding worker thread.

## 📄 License

MIT
