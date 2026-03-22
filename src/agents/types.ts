// ─── Agent Architecture — Shared Types ────────────────────────────────────────

export type AgentId = 'orchestrator' | 'creative' | 'campaigner' | 'analyst';
export type AgentStatus = 'IDLE' | 'THINKING' | 'WORKING' | 'DONE' | 'ERROR';

export const AGENT_META: Record<AgentId, { name: string; codename: string; color: string; description: string }> = {
  orchestrator: {
    name:        'Head of Agents',
    codename:    'Orchestrator',
    color:       '#a78bfa',
    description: 'Strategy, planning & delegation',
  },
  creative: {
    name:        'Zipit Studio',
    codename:    'Creative',
    color:       '#f472b6',
    description: 'AI ideation & asset generation',
  },
  campaigner: {
    name:        'Ads Manager',
    codename:    'Campaigner',
    color:       'var(--brand-primary)',
    description: 'Strategic placement & execution',
  },
  analyst: {
    name:        'Insights',
    codename:    'Analyst',
    color:       '#06b6d4',
    description: 'Performance evaluation & feedback',
  },
};

// ─── Messages ─────────────────────────────────────────────────────────────────

export interface AgentMessage {
  id:          string;
  from:        AgentId | 'user';
  to:          AgentId;
  content:     string;
  toolCall?:   { name: string; input: Record<string, unknown> };
  toolResult?: unknown;
  timestamp:   string;
  sessionId:   string;
}

// ─── Action log ───────────────────────────────────────────────────────────────

export interface AgentAction {
  id:        string;
  agentId:   AgentId;
  label:     string;
  status:    'pending' | 'success' | 'error';
  detail?:   string;
  timestamp: string;
}

// ─── Per-agent conversation ───────────────────────────────────────────────────

export interface AgentConversation {
  messages:   AgentMessage[];
  status:     AgentStatus;
  lastAction: string;   // human-readable last action summary
}

// ─── Bus state ────────────────────────────────────────────────────────────────

export type ConversationMap = Record<AgentId, AgentConversation>;

export interface AgentBusState {
  conversations: ConversationMap;
  actionLog:     AgentAction[];    // last 50
  activeAgent:   AgentId;          // which agent is in focus in the UI
}

// ─── Dispatch ─────────────────────────────────────────────────────────────────

export interface SendToAgentOptions {
  from:       AgentId | 'user';
  to:         AgentId;
  content:    string;
  sessionId?: string;
}

// ─── Claude tool definition (mirrors Anthropic SDK shape) ─────────────────────

export interface ToolProperty {
  type:        string;
  description: string;
  enum?:       string[];
}

export interface ClaudeToolDefinition {
  name:         string;
  description:  string;
  input_schema: {
    type:       'object';
    properties: Record<string, ToolProperty>;
    required:   string[];
  };
}
