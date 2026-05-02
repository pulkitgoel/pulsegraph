# ⚡ PulseGraph

PulseGraph is a chat-first architecture animation tool. It converts natural language descriptions or Mermaid code into high-fidelity, animated system diagrams with glowing data flows.

## ✨ Features

- **Two-Pass LLM Pipeline**:
  - **Pass 1 (Generate)**: Turns user intent into clean Mermaid flowchart syntax.
  - **Pass 2 (Validate)**: Reviews and corrects logical gaps (e.g., adds missing return paths).
- **Deterministic Mermaid Parser**: A pure TypeScript parser that maps Mermaid shapes to specific system components (Databases, Caches, Gateways, Users, etc.).
- **Professional GIF Export**:
  - **HD Resolution**: 1280×720 (720p) output.
  - **Smooth Motion**: Uses quadratic bezier curves for edges and pulse animations.
  - **Native Save**: Integrated with the browser's File System Access API for direct "Save As" functionality.
- **Developer transparency**: Collapsible panel to view and copy the raw, validated Mermaid source.

## 🛠 Tech Stack

- **Frontend**: React 18, TypeScript, Vite
- **Animations**: GSAP (MotionPathPlugin)
- **Layout**: Dagre (Directed Graph Layout)
- **AI**: DeepSeek (via `llmService.ts`)
- **GIF Encoding**: `gifenc` (in a Web Worker)

## 🚀 Getting Started

### 1. Installation

```bash
# Clone the repository
git clone <repo-url>
cd PulseGraph

# Install dependencies
npm install
```

### 2. Configuration

PulseGraph requires a **DeepSeek API Key**.
- Launch the app (`npm run dev`).
- Enter your API key in the configuration modal.
- The key is stored locally in your browser (`localStorage`) and is only sent directly to the DeepSeek API.

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

PulseGraph uses Mermaid shape syntax to automatically assign icons and styles:

| Mermaid Syntax | Shape | Node Type |
|---|---|---|
| `A((Label))` | Circle | **User** |
| `A[(Label)]` | Cylinder | **Database** |
| `A[/Label/]` | Parallelogram | **Cache / Queue** |
| `A{Label}` | Diamond | **Gateway / Router** |
| `A[Label]` | Rectangle | **Service / Backend** |
| `A(Label)` | Rounded | **Client / Frontend** |

## 📁 Project Structure

- `src/services/llmService.ts`: Manages the two-pass generation/validation pipeline.
- `src/parser/mermaidParser.ts`: The deterministic parser for Mermaid syntax.
- `src/parser/layoutEngine.ts`: Calculates node/edge positions using Dagre.
- `src/components/DiagramCanvas.tsx`: SVG renderer with GSAP-driven animations.
- `src/services/gifWorker.ts`: High-resolution GIF encoding in a background thread.

## 📄 License

MIT
