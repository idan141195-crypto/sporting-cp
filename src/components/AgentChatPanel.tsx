// ─── Agent Chat Panel ─────────────────────────────────────────────────────────
// Shared chat UI used by AgentHub and NewCampaignConversation.
// Renders messages for a specific agent and provides an input bar.

import React, { useEffect, useRef, useState } from 'react';
import { Send, ChevronDown, ChevronUp } from 'lucide-react';
import { useAgentBus } from '../agents/AgentContext';
import { AGENT_META } from '../agents/types';
import type { AgentId, AgentMessage } from '../agents/types';

interface AgentChatPanelProps {
  agentId:       AgentId;
  placeholder?:  string;
  greeting?:     string;    // shown as first message if conversation is empty
  sessionId?:    string;
}

// ─── Message renderers ────────────────────────────────────────────────────────

function renderContent(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={i} style={{ color: '#e2e8f0', fontWeight: 700 }}>{part.slice(2, -2)}</strong>
      : <span key={i}>{part}</span>
  );
}

function UserBubble({ msg }: { msg: AgentMessage }) {
  return (
    <div className="flex justify-end">
      <div
        className="max-w-[75%] rounded-xl px-4 py-2.5 text-sm"
        style={{ background: 'color-mix(in srgb, var(--brand-primary) 20%, transparent)', color: '#e2e8f0', border: '1px solid color-mix(in srgb, var(--brand-primary) 35%, transparent)' }}
      >
        {msg.content}
      </div>
    </div>
  );
}

function AgentBubble({ msg, agentId }: { msg: AgentMessage; agentId: AgentId }) {
  const meta = AGENT_META[agentId];
  return (
    <div className="flex items-start gap-3">
      {/* Avatar */}
      <div
        className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-black uppercase"
        style={{ background: `${meta.color}20`, border: `1px solid ${meta.color}50`, color: meta.color }}
      >
        {meta.codename.slice(0, 2)}
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-[10px] font-mono uppercase tracking-wider mb-1 block" style={{ color: meta.color }}>
          {meta.name}
        </span>
        <div
          className="rounded-xl px-4 py-2.5 text-sm leading-relaxed"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#d1d5db' }}
        >
          {renderContent(msg.content)}
        </div>
      </div>
    </div>
  );
}

function ToolCallBubble({ msg, agentId }: { msg: AgentMessage; agentId: AgentId }) {
  const [open, setOpen] = useState(false);
  const meta = AGENT_META[agentId];
  if (!msg.toolCall) return null;

  return (
    <div className="flex items-start gap-3">
      <div className="shrink-0 w-7" />
      <div className="flex-1 min-w-0">
        <button
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider px-3 py-1.5 rounded-lg transition-colors w-full text-left"
          style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${meta.color}30`, color: `${meta.color}aa` }}
        >
          <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: meta.color }} />
          <span className="flex-1">{msg.toolCall.name.replace(/_/g, ' ')}</span>
          {open ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
        </button>
        {open && (
          <pre
            className="mt-1 rounded-lg px-3 py-2 text-[10px] font-mono overflow-x-auto"
            style={{ background: 'rgba(0,0,0,0.3)', color: '#6b7280', border: '1px solid rgba(255,255,255,0.05)' }}
          >
            {JSON.stringify(msg.toolCall.input, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}

// ─── Greeting message ─────────────────────────────────────────────────────────

function GreetingBubble({ text, agentId }: { text: string; agentId: AgentId }) {
  const meta = AGENT_META[agentId];
  return (
    <div className="flex items-start gap-3">
      <div
        className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-black uppercase"
        style={{ background: `${meta.color}20`, border: `1px solid ${meta.color}50`, color: meta.color }}
      >
        {meta.codename.slice(0, 2)}
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-[10px] font-mono uppercase tracking-wider mb-1 block" style={{ color: meta.color }}>
          {meta.name}
        </span>
        <div
          className="rounded-xl px-4 py-2.5 text-sm leading-relaxed"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#d1d5db' }}
        >
          {renderContent(text)}
        </div>
      </div>
    </div>
  );
}

// ─── Thinking indicator ───────────────────────────────────────────────────────

function ThinkingIndicator({ agentId }: { agentId: AgentId }) {
  const meta = AGENT_META[agentId];
  return (
    <div className="flex items-start gap-3">
      <div
        className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-black uppercase"
        style={{ background: `${meta.color}20`, border: `1px solid ${meta.color}50`, color: meta.color }}
      >
        {meta.codename.slice(0, 2)}
      </div>
      <div
        className="rounded-xl px-4 py-2.5 flex items-center gap-1.5"
        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
      >
        {[0, 150, 300].map(delay => (
          <span
            key={delay}
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: meta.color, animation: `pulse 1.4s ease-in-out ${delay}ms infinite` }}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export const AgentChatPanel: React.FC<AgentChatPanelProps> = ({
  agentId,
  placeholder,
  greeting,
  sessionId,
}) => {
  const { state, dispatch } = useAgentBus();
  const conv   = state.conversations[agentId];
  const meta   = AGENT_META[agentId];
  const isThinking = conv.status === 'THINKING' || conv.status === 'WORKING';

  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conv.messages, isThinking]);

  const send = async () => {
    const text = input.trim();
    if (!text || isThinking) return;
    setInput('');
    await dispatch({ from: 'user', to: agentId, content: text, sessionId });
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  return (
    <div className="flex flex-col h-full">
      {/* ── Message list ── */}
      <div className="flex-1 overflow-y-auto space-y-4 p-4 min-h-0">
        {greeting && conv.messages.length === 0 && (
          <GreetingBubble text={greeting} agentId={agentId} />
        )}

        {conv.messages.map(msg => {
          if (msg.from === 'user') return <UserBubble key={msg.id} msg={msg} />;
          if (msg.toolCall)        return <ToolCallBubble key={msg.id} msg={msg} agentId={agentId} />;
          return <AgentBubble key={msg.id} msg={msg} agentId={agentId} />;
        })}

        {isThinking && <ThinkingIndicator agentId={agentId} />}
        <div ref={bottomRef} />
      </div>

      {/* ── Input bar ── */}
      <div
        className="shrink-0 p-3 border-t"
        style={{ borderColor: 'var(--brand-muted)' }}
      >
        <div
          className="flex items-center gap-2 rounded-xl px-3 py-2"
          style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${meta.color}30` }}
        >
          <textarea
            rows={1}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={onKey}
            placeholder={placeholder ?? `Message ${meta.name}…`}
            disabled={isThinking}
            className="flex-1 bg-transparent outline-none resize-none text-sm placeholder-gray-600 text-gray-200"
            style={{ maxHeight: '80px' }}
          />
          <button
            onClick={send}
            disabled={!input.trim() || isThinking}
            className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-opacity disabled:opacity-30"
            style={{ background: meta.color }}
          >
            <Send size={13} color="#000" />
          </button>
        </div>
      </div>
    </div>
  );
};
