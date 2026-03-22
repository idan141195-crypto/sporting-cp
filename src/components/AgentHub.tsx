// ─── Agent Hub ────────────────────────────────────────────────────────────────
// Main Agent Status dashboard: 4 status cards + chat panel + action log

import React from 'react';
import { Bot, CheckCircle, XCircle, Clock, Zap } from 'lucide-react';
import { useAgentBus } from '../agents/AgentContext';
import { AGENT_META } from '../agents/types';
import type { AgentId, AgentStatus, AgentAction } from '../agents/types';
import { AgentChatPanel } from './AgentChatPanel';

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: AgentStatus }) {
  const map: Record<AgentStatus, { label: string; color: string; pulse: boolean }> = {
    IDLE:     { label: 'Idle',     color: '#4b5563', pulse: false },
    THINKING: { label: 'Thinking', color: '#f59e0b', pulse: true  },
    WORKING:  { label: 'Working',  color: 'var(--brand-primary)', pulse: true  },
    DONE:     { label: 'Done',     color: '#10b981', pulse: false },
    ERROR:    { label: 'Error',    color: '#ef4444', pulse: false },
  };
  const { label, color, pulse } = map[status];
  return (
    <span className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider" style={{ color }}>
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{ background: color, animation: pulse ? 'pulse 1.4s ease-in-out infinite' : 'none' }}
      />
      {label}
    </span>
  );
}

// ─── Agent status card ────────────────────────────────────────────────────────

function AgentStatusCard({ agentId, isActive, onClick }: { agentId: AgentId; isActive: boolean; onClick: () => void }) {
  const { state } = useAgentBus();
  const conv      = state.conversations[agentId];
  const meta      = AGENT_META[agentId];

  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-xl p-4 transition-all duration-200"
      style={{
        background:   isActive ? `${meta.color}12` : 'rgba(255,255,255,0.03)',
        border:       `1px solid ${isActive ? `${meta.color}50` : 'rgba(255,255,255,0.07)'}`,
        cursor:       'pointer',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div
            className="w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black uppercase"
            style={{ background: `${meta.color}20`, color: meta.color }}
          >
            {meta.codename.slice(0, 2)}
          </div>
          <div>
            <p className="text-white text-xs font-bold leading-none">{meta.name}</p>
            <p className="text-[10px] font-mono mt-0.5" style={{ color: '#4b5563' }}>{meta.codename}</p>
          </div>
        </div>
        <StatusBadge status={conv.status} />
      </div>

      {/* Description */}
      <p className="text-[11px]" style={{ color: '#6b7280' }}>{meta.description}</p>

      {/* Last action */}
      {conv.lastAction && conv.lastAction !== 'Waiting for task' && (
        <p className="text-[10px] font-mono mt-2 truncate" style={{ color: `${meta.color}80` }}>
          {conv.lastAction}
        </p>
      )}
    </button>
  );
}

// ─── Action log entry ─────────────────────────────────────────────────────────

function ActionLogEntry({ action }: { action: AgentAction }) {
  const meta = AGENT_META[action.agentId];
  const time = new Date(action.timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const statusIcon = action.status === 'success'
    ? <CheckCircle size={11} color="#10b981" />
    : action.status === 'error'
    ? <XCircle size={11} color="#ef4444" />
    : <Clock size={11} color="#f59e0b" />;

  return (
    <div
      className="flex items-start gap-2.5 px-3 py-2 rounded-lg"
      style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}
    >
      <span className="shrink-0 mt-0.5">{statusIcon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span
            className="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded"
            style={{ background: `${meta.color}15`, color: meta.color }}
          >
            {meta.codename}
          </span>
          <span className="text-[10px] font-mono" style={{ color: '#4b5563' }}>{time}</span>
        </div>
        <p className="text-[11px] mt-0.5 truncate" style={{ color: '#9ca3af' }}>{action.label}</p>
        {action.detail && (
          <p className="text-[10px] font-mono mt-0.5 truncate" style={{ color: '#4b5563' }}>{action.detail}</p>
        )}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const ALL_AGENTS: AgentId[] = ['orchestrator', 'creative', 'campaigner', 'analyst'];

const GREETINGS: Record<AgentId, string> = {
  orchestrator: "I'm your Head of Agents. Tell me your marketing goal — I'll coordinate the team to execute it. For example: **\"Launch a summer sale campaign for luxury shoes\"** or **\"Why are my ads underperforming?\"**",
  creative:     "I'm Zipit Studio, your creative AI. Tell me what to generate: **images, videos, or captions**. I'll match your brand style automatically.",
  campaigner:   "I'm your Ads Manager. I can fetch your active ad sets, attach new creatives, and push campaigns live to Meta. What would you like to do?",
  analyst:      "I'm your Insights analyst. Ask me about **ROAS performance**, which campaigns to scale or pause, creative fatigue, or geo opportunities.",
};

export const AgentHub: React.FC = () => {
  const { state, setActiveAgent } = useAgentBus();
  const activeAgent = state.activeAgent;
  const actionLog   = state.actionLog;

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center gap-3">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: 'color-mix(in srgb, var(--brand-primary) 15%, transparent)', border: '1px solid color-mix(in srgb, var(--brand-primary) 30%, transparent)' }}
        >
          <Bot size={16} color="var(--brand-primary)" />
        </div>
        <div>
          <h2 className="text-white font-black text-sm uppercase tracking-widest" style={{ fontFamily: 'var(--font-display)' }}>
            Agent Hub
          </h2>
          <p className="text-[11px] font-mono" style={{ color: '#4b5563' }}>AI-powered specialist team</p>
        </div>
        <div className="ml-auto flex items-center gap-1.5 text-[10px] font-mono px-2.5 py-1 rounded"
          style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', color: '#10b981' }}>
          <Zap size={10} />
          <span>{ALL_AGENTS.length} Agents Online</span>
        </div>
      </div>

      {/* ── Agent Status Grid ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {ALL_AGENTS.map(id => (
          <AgentStatusCard
            key={id}
            agentId={id}
            isActive={activeAgent === id}
            onClick={() => setActiveAgent(id)}
          />
        ))}
      </div>

      {/* ── Main area: Chat + Action Log ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4" style={{ height: '520px' }}>
        {/* Chat panel — 2/3 width */}
        <div
          className="lg:col-span-2 rounded-xl overflow-hidden flex flex-col"
          style={{ background: 'var(--brand-surface-card)', border: '1px solid rgba(255,255,255,0.07)' }}
        >
          {/* Chat header */}
          <div
            className="shrink-0 flex items-center gap-3 px-4 py-3 border-b"
            style={{ borderColor: 'var(--brand-muted)' }}
          >
            <div
              className="w-6 h-6 rounded-md flex items-center justify-center text-[9px] font-black uppercase"
              style={{ background: `${AGENT_META[activeAgent].color}20`, color: AGENT_META[activeAgent].color }}
            >
              {AGENT_META[activeAgent].codename.slice(0, 2)}
            </div>
            <div>
              <p className="text-white text-xs font-bold">{AGENT_META[activeAgent].name}</p>
              <p className="text-[10px]" style={{ color: '#4b5563' }}>
                {activeAgent === 'orchestrator'
                  ? 'Talks to all agents on your behalf'
                  : 'Direct specialist access'}
              </p>
            </div>
            {activeAgent !== 'orchestrator' && (
              <button
                onClick={() => setActiveAgent('orchestrator')}
                className="ml-auto text-[10px] font-mono px-2.5 py-1 rounded-lg transition-colors"
                style={{ background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.2)', color: '#a78bfa' }}
              >
                ← Back to Orchestrator
              </button>
            )}
          </div>

          {/* Chat body */}
          <div className="flex-1 min-h-0">
            <AgentChatPanel
              agentId={activeAgent}
              greeting={GREETINGS[activeAgent]}
            />
          </div>
        </div>

        {/* Action log — 1/3 width */}
        <div
          className="rounded-xl overflow-hidden flex flex-col"
          style={{ background: 'var(--brand-surface-card)', border: '1px solid rgba(255,255,255,0.07)' }}
        >
          <div
            className="shrink-0 px-4 py-3 border-b"
            style={{ borderColor: 'var(--brand-muted)' }}
          >
            <p className="text-white text-xs font-bold uppercase tracking-wider">Action Log</p>
            <p className="text-[10px] font-mono mt-0.5" style={{ color: '#4b5563' }}>
              {actionLog.length} events
            </p>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
            {actionLog.length === 0 && (
              <div className="flex flex-col items-center justify-center h-32 text-center">
                <Clock size={20} color="#374151" className="mb-2" />
                <p className="text-xs" style={{ color: '#4b5563' }}>No actions yet</p>
                <p className="text-[10px] mt-1" style={{ color: '#374151' }}>Agent actions will appear here</p>
              </div>
            )}
            {actionLog.map(action => (
              <ActionLogEntry key={action.id} action={action} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
