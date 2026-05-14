export type NodeType =
  | 'user' | 'client' | 'gateway' | 'loadbalancer'
  | 'service' | 'database' | 'cache' | 'queue' | 'external';

export interface GraphNode {
  id: string; label: string; type: NodeType;
  width: number; height: number; x?: number; y?: number;
  color?: string; // HEX or CSS color
}
export interface GraphEdge {
  id: string; from: string; to: string; label?: string;
  points?: { x: number; y: number }[];
  isBackEdge?: boolean;
}
export interface GraphGroup {
  id: string; label: string; members: string[];
  color?: string; // e.g. "rgba(147,51,234,0.08)"
  parentId?: string; // Support nested subgraphs
  x?: number; y?: number; width?: number; height?: number;
}
export interface Graph {
  nodes: GraphNode[]; edges: GraphEdge[];
  groups?: GraphGroup[]; layout?: 'LR' | 'TB';
}
export interface ChatMessage {
  id: string; role: 'user' | 'assistant';
  content: string; timestamp: Date;
}
export type LlmProvider = 'deepseek' | 'ollama';
export type OllamaModel = 'gemma3:4b' | 'gemma4:e4b';

export interface LLMResponse {
  message: string; graph?: Graph;
  isOffTopic?: boolean; error?: string;
}
