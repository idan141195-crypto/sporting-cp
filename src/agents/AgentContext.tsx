// ─── Agent Context — Message Bus ──────────────────────────────────────────────
// Central React context that holds all agent state and routes dispatch() calls
// to the correct specialist agent runner.

import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import type {
  AgentId, AgentBusState, AgentAction, AgentMessage,
  AgentConversation, ConversationMap, SendToAgentOptions,
} from './types';
import { AGENT_META } from './types';
import { runOrchestratorAgent } from './orchestrator/OrchestratorAgent';
import { runAnalystAgent }      from './analyst/AnalystAgent';
import { runCreativeAgent }     from './creative/CreativeAgent';
import { runCampaignerAgent }   from './campaigner/CampaignerAgent';
import type Anthropic from '@anthropic-ai/sdk';

// ─── Initial state ─────────────────────────────────────────────────────────────

function makeEmptyConversation(): AgentConversation {
  return { messages: [], status: 'IDLE', lastAction: 'Waiting for task' };
}

const ALL_AGENTS: AgentId[] = ['orchestrator', 'creative', 'campaigner', 'analyst'];

function initialBusState(): AgentBusState {
  const conversations = {} as ConversationMap;
  for (const id of ALL_AGENTS) conversations[id] = makeEmptyConversation();
  return { conversations, actionLog: [], activeAgent: 'orchestrator' };
}

// ─── Context type ─────────────────────────────────────────────────────────────

interface AgentContextValue {
  state:          AgentBusState;
  dispatch:       (opts: SendToAgentOptions) => Promise<string>;
  setActiveAgent: (id: AgentId) => void;
  pairs:          unknown[];
}

const AgentContext = createContext<AgentContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

interface AgentProviderProps {
  children: React.ReactNode;
  pairs?:   unknown[];   // live campaign pairs from Dashboard for Analyst context
}

export function AgentProvider({ children, pairs = [] }: AgentProviderProps) {
  const [state, setState] = useState<AgentBusState>(initialBusState);

  // Per-agent API conversation history (Claude messages format) — kept outside
  // React state so updates don't trigger re-renders during tool-use loops.
  const historiesRef = useRef<Record<AgentId, Anthropic.MessageParam[]>>({
    orchestrator: [],
    creative:     [],
    campaigner:   [],
    analyst:      [],
  });

  // ─── Helper: update a single agent's status and lastAction ─────────────────

  const setAgentStatus = useCallback((agentId: AgentId, status: AgentConversation['status'], lastAction?: string) => {
    setState(s => ({
      ...s,
      conversations: {
        ...s.conversations,
        [agentId]: {
          ...s.conversations[agentId],
          status,
          ...(lastAction !== undefined ? { lastAction } : {}),
        },
      },
    }));
  }, []);

  // ─── Helper: append a chat message to an agent's conversation ──────────────

  const appendMessage = useCallback((msg: AgentMessage) => {
    setState(s => ({
      ...s,
      conversations: {
        ...s.conversations,
        [msg.to]: {
          ...s.conversations[msg.to],
          messages: [...s.conversations[msg.to].messages, msg],
        },
      },
    }));
  }, []);

  // ─── Helper: append to action log (keep last 50) ───────────────────────────

  const appendAction = useCallback((action: AgentAction) => {
    setState(s => ({
      ...s,
      actionLog: [action, ...s.actionLog].slice(0, 50),
    }));
  }, []);

  // ─── onAction callback passed to agent runners ─────────────────────────────

  const makeOnAction = useCallback((agentId: AgentId) => {
    return (partial: Omit<AgentAction, 'id' | 'timestamp'>) => {
      const action: AgentAction = {
        ...partial,
        id:        crypto.randomUUID(),
        timestamp: new Date().toISOString(),
      };
      appendAction(action);
      if (partial.status === 'pending') {
        setAgentStatus(agentId, 'WORKING', partial.label);
      }
    };
  }, [appendAction, setAgentStatus]);

  // ─── dispatch ──────────────────────────────────────────────────────────────

  const dispatch = useCallback(async (opts: SendToAgentOptions): Promise<string> => {
    const { from, to, content } = opts;
    const sessionId = opts.sessionId ?? crypto.randomUUID();

    // 1. Append user message to conversation
    const userMsg: AgentMessage = {
      id: crypto.randomUUID(), from, to, content, timestamp: new Date().toISOString(), sessionId,
    };
    appendMessage(userMsg);

    // 2. Set agent to THINKING
    setAgentStatus(to, 'THINKING', 'Analyzing…');

    try {
      const history    = historiesRef.current[to];
      const onAction   = makeOnAction(to);
      let   result: { text: string; updatedHistory: Anthropic.MessageParam[] };

      // 3. Route to correct agent runner
      switch (to) {
        case 'orchestrator':
          result = await runOrchestratorAgent(content, history, pairs, onAction);
          break;
        case 'analyst':
          result = await runAnalystAgent(content, history, pairs, onAction);
          break;
        case 'creative':
          result = await runCreativeAgent(content, history, onAction);
          break;
        case 'campaigner':
          result = await runCampaignerAgent(content, history, onAction);
          break;
        default:
          throw new Error(`Unknown agent: ${to}`);
      }

      // 4. Persist updated history
      historiesRef.current[to] = result.updatedHistory;

      // 5. Append agent response to conversation
      const agentMsg: AgentMessage = {
        id:        crypto.randomUUID(),
        from:      to,
        to:        from === 'user' ? to : from,    // for UI display
        content:   result.text,
        timestamp: new Date().toISOString(),
        sessionId,
      };
      appendMessage(agentMsg);

      // 6. Set DONE
      const meta = AGENT_META[to];
      setAgentStatus(to, 'DONE', `${meta.codename} responded`);

      return result.text;

    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);

      const errorMsg: AgentMessage = {
        id:        crypto.randomUUID(),
        from:      to,
        to:        from === 'user' ? to : from,
        content:   `Error: ${errMsg}`,
        timestamp: new Date().toISOString(),
        sessionId,
      };
      appendMessage(errorMsg);
      setAgentStatus(to, 'ERROR', `Error: ${errMsg.slice(0, 60)}`);
      throw err;
    }
  }, [appendMessage, makeOnAction, pairs, setAgentStatus]);

  // ─── setActiveAgent ────────────────────────────────────────────────────────

  const setActiveAgent = useCallback((id: AgentId) => {
    setState(s => ({ ...s, activeAgent: id }));
  }, []);

  return (
    <AgentContext.Provider value={{ state, dispatch, setActiveAgent, pairs }}>
      {children}
    </AgentContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAgentBus(): AgentContextValue {
  const ctx = useContext(AgentContext);
  if (!ctx) throw new Error('useAgentBus must be used inside <AgentProvider>');
  return ctx;
}
