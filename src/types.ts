export type NodeType =
  | 'user'
  | 'client'
  | 'gateway'
  | 'loadbalancer'
  | 'service'
  | 'database'
  | 'cache'
  | 'queue'
  | 'external';

export interface GraphNode {
  id: string;
  label: string;
  type: NodeType;
  width: number;
  height: number;
  x?: number;
  y?: number;
  color?: string; // HEX or CSS color
}
export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  label?: string;
  points?: { x: number; y: number }[];
  isBackEdge?: boolean;
  arrow?: 'arrow' | 'none' | 'cross' | 'circle';
  thick?: boolean;
  dashed?: boolean; // rendered as a dashed line (e.g. async / AI / side calls)
}
export interface GraphGroup {
  id: string;
  label: string;
  members: string[];
  color?: string; // e.g. "rgba(147,51,234,0.08)"
  parentId?: string; // Support nested subgraphs
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}
export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  groups?: GraphGroup[];
  layout?: 'LR' | 'TB' | 'RL' | 'BT';
  /** The Mermaid source this graph was parsed from (attached by llmService). */
  mermaidSource?: string;
  /** Human-readable notes about lines/tokens the parser could not understand. */
  warnings?: string[];
}
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}
export type LlmProvider = 'deepseek' | 'ollama';
export type OllamaModel = string;
