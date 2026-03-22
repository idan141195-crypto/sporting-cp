import React, { useCallback, useEffect, useRef, useState } from 'react';
import Anthropic from '@anthropic-ai/sdk';
import type { CampaignPair } from './CampaignView';

// ─── Types ────────────────────────────────────────────────────────────────────

interface QuickAction {
  type:      string;
  adSetId:   string;
  adSetName: string;
  factor?:   number;
  label?:    string;
}

interface Tip {
  urgency:   'critical' | 'warning' | 'opportunity';
  title:     string;
  body:      string;
  adSetId:   string | null;
  adSetName: string | null;
  action:    QuickAction | null;
  etsHours?: number | null;
}

interface RecoResponse {
  generatedAt:    string;
  siteHealth:     string;
  tips:           Tip[];
  contextSummary: { totalPairs: number; scaling: number; paused: number; held: number; };
}

interface ChatMessage {
  id:      string;
  role:    'user' | 'assistant';
  content: string;
}

interface BridgeCoachPanelProps {
  pairs:      CampaignPair[];
  siteHealth: string;
  bugPage:    string | null;
  isLive:     boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const API_BASE  = 'http://localhost:3001';
const RECO_POLL = 30_000;

const URGENCY = {
  critical:    { bg: 'bg-danger-red/8',      border: 'border-danger-red/30',        dot: 'bg-danger-red',     icon: '🔴', label: 'CRITICAL'    },
  warning:     { bg: 'bg-cyber-amber/8',     border: 'border-cyber-amber/30',       dot: 'bg-cyber-amber',    icon: '⚠️', label: 'WARNING'     },
  opportunity: { bg: 'bg-neon-cyan/8',       border: 'border-neon-cyan/30',         dot: 'bg-neon-cyan',      icon: '⚡', label: 'OPPORTUNITY' },
};

const QUICK_BRIDGE_PROMPTS = [
  'Why were these campaigns paused?',
  'Which product has the best ROI right now?',
  'Which campaign is at stockout risk?',
  'What should I fix first?',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildBridgeSystemPrompt(pairs: CampaignPair[], siteHealth: string, bugPage: string | null): string {
  const pairLines = pairs.map(p => {
    const ets = p.etsHours != null
      ? ` | ETS: ~${p.etsHours < 1 ? `${Math.round(p.etsHours * 60)}m` : `${p.etsHours.toFixed(1)}h`} (${p.salesVelocity?.toFixed(1) ?? '?'} units/hr)`
      : '';
    return `- ${p.productName} (ID ${p.productId}) → Ad Set "${p.adSetName}" | ROAS: ${p.roas?.toFixed(2) ?? 'N/A'}x | Inventory: ${p.inventory ?? 'N/A'} units${ets} | Status: ${p.liveDecision} | Reason: ${p.liveDecisionReason}`;
  }).join('\n');

  return `You are ScaleAI's Bridge Intelligence Coach — the AI layer that explains the automated decisions made by the ScaleAI engine connecting Budo's e-commerce store inventory to Meta Ads campaigns.

## Your Role
You explain **why** specific automated actions were taken, **what** the operator should do next, and **how** to interpret the live data bridge between inventory and ad performance.

## Language & Tone
- If the user writes in Hebrew, reply in Hebrew.
- Be direct and actionable. Max 3–4 short sentences per response.
- Always tie ad decisions back to inventory or site health context.
- Never say "I think" or "perhaps" — speak with data-backed confidence.

## Live Bridge State
Site Health: ${siteHealth}${bugPage ? ` (bug on /${bugPage})` : ''}

Budo Products ↔ Meta Ad Sets:
${pairLines}

## Decision Logic
- SCALE: ROAS > 5.0 AND inventory > 10 AND no HIGH cart/checkout drop-off AND ETS > 6h → budget +15%
- PAUSE: inventory < 2 OR site BUG_DETECTED OR ROAS < 3.0
- HOLD: ROAS in 3.0–5.0 range, OR ROAS > 5.0 but blocked by funnel/inventory/ETS gates
- SOFT-PAUSE (ETS gate): if ETS < 6h on a scaling campaign → HOLD to extend inventory runway

## Response Format
- Use **bold** for product names, ROAS values, inventory counts
- End every response with one clear next action
- Keep answers under 120 words`;
}

function renderBold(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={i} className="text-neon-cyan font-bold">{part.slice(2, -2)}</strong>
      : <span key={i}>{part}</span>
  );
}

// ─── Typewriter component ─────────────────────────────────────────────────────

const Typewriter: React.FC<{ text: string; speed?: number }> = ({ text, speed = 12 }) => {
  const [displayed, setDisplayed] = useState('');

  useEffect(() => {
    setDisplayed('');
    let i = 0;
    const id = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) clearInterval(id);
    }, speed);
    return () => clearInterval(id);
  }, [text, speed]);

  return <>{renderBold(displayed)}</>;
};

// ─── Quick Action Button ──────────────────────────────────────────────────────

const ActionButton: React.FC<{ action: QuickAction; isLive: boolean }> = ({ action, isLive }) => {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [msg,   setMsg]   = useState('');

  const handleClick = async () => {
    if (!isLive) {
      setMsg('Start the backend to apply actions.');
      setState('error');
      setTimeout(() => setState('idle'), 3000);
      return;
    }
    setState('loading');
    try {
      const res  = await fetch(`${API_BASE}/api/apply-action`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action),
      });
      const json = await res.json();
      if (json.success) { setMsg(json.message); setState('done'); }
      else              { setMsg(json.error ?? 'Action failed'); setState('error'); }
    } catch {
      setMsg('Backend unreachable'); setState('error');
    }
    setTimeout(() => { setState('idle'); setMsg(''); }, 4000);
  };

  if (state === 'done')  return <div className="mt-2.5 flex items-center gap-2 text-xs text-profit-emerald font-mono"><span>✓</span><span>{msg}</span></div>;
  if (state === 'error') return <div className="mt-2.5 flex items-center gap-2 text-xs text-danger-red font-mono"><span>✕</span><span>{msg}</span></div>;

  return (
    <button
      onClick={handleClick}
      disabled={state === 'loading'}
      className="mt-2.5 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider
        bg-neon-cyan/10 border border-neon-cyan/30 text-neon-cyan
        hover:bg-neon-cyan/20 hover:border-neon-cyan/50
        transition-all duration-200 disabled:opacity-50"
    >
      {state === 'loading'
        ? <><span className="animate-spin text-xs">◌</span><span>Applying…</span></>
        : <><span>⚡</span><span>{action.label ?? 'Apply AI Suggestion'}</span></>
      }
    </button>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

export const BridgeCoachPanel: React.FC<BridgeCoachPanelProps> = ({ pairs, siteHealth, bugPage, isLive }) => {
  const [isOpen,    setIsOpen]    = useState(false);
  const [tips,      setTips]      = useState<Tip[]>([]);
  const [tipsAt,    setTipsAt]    = useState<string | null>(null);
  const [messages,  setMessages]  = useState<ChatMessage[]>([]);
  const [input,     setInput]     = useState('');
  const [isTyping,  setIsTyping]  = useState(false);
  const [activeTab, setActiveTab] = useState<'tips' | 'chat' | 'log'>('tips');

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLInputElement>(null);
  const anthropic = useRef(new Anthropic({
    apiKey: import.meta.env.VITE_ANTHROPIC_API_KEY,
    dangerouslyAllowBrowser: true,
  }));

  // Fetch tips
  const fetchTips = useCallback(async () => {
    try {
      const res  = await fetch(`${API_BASE}/api/ai-recommendations`, { signal: AbortSignal.timeout(4000) });
      const json: RecoResponse = await res.json();
      setTips(json.tips);
      setTipsAt(new Date(json.generatedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
    } catch {
      setTips(generateMockTips(pairs, siteHealth, bugPage));
      setTipsAt(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
    }
  }, [pairs, siteHealth, bugPage]);

  useEffect(() => {
    if (isOpen) fetchTips();
    const id = setInterval(() => { if (isOpen) fetchTips(); }, RECO_POLL);
    return () => clearInterval(id);
  }, [isOpen, fetchTips]);

  useEffect(() => {
    if (isOpen && activeTab === 'chat') setTimeout(() => inputRef.current?.focus(), 200);
  }, [isOpen, activeTab]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // Build system log entries from pairs
  const logEntries = pairs
    .filter(p => p.lastAction)
    .slice()
    .sort((a, b) => (b.lastActionAt ?? '').localeCompare(a.lastActionAt ?? ''))
    .map(p => ({
      action:    p.lastAction!,
      adSetName: p.adSetName,
      roas:      p.roas,
      reason:    p.lastActionReason,
      ago:       p.lastActionAgo,
    }));

  // Chat with Claude
  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isTyping) return;

    const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', content: trimmed };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    const history     = [...messages, userMsg].map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));
    const assistantId = (Date.now() + 1).toString();
    setMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: '' }]);

    try {
      let accumulated = '';
      const stream = anthropic.current.messages.stream({
        model: 'claude-sonnet-4-6', max_tokens: 300,
        system: buildBridgeSystemPrompt(pairs, siteHealth, bugPage),
        messages: history,
      });
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          accumulated += event.delta.text;
          setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: accumulated } : m));
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: `⚠️ ${msg}` } : m));
    } finally {
      setIsTyping(false);
    }
  };

  // ── Collapsed trigger ─────────────────────────────────────────────────────
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-200 group w-full sm:w-auto"
        style={{
          background: 'rgba(13,8,26,0.9)',
          border: isLive ? '1px solid rgba(6,214,240,0.25)' : '1px solid rgba(139,92,246,0.35)',
          boxShadow: isLive ? '0 0 20px rgba(6,214,240,0.08)' : 'none',
        }}
      >
        <div className="relative">
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm"
            style={{ background: 'rgba(6,214,240,0.12)', border: '1px solid rgba(6,214,240,0.3)' }}>
            🤖
          </div>
          <span className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border-2 ${
            isLive ? 'bg-neon-cyan animate-pulse-cyan' : 'bg-learning-blue'
          }`} style={{ borderColor: 'rgba(13,8,26,1)' }} />
        </div>
        <div className="text-left flex-1">
          <p className="text-neon-cyan text-xs font-bold uppercase tracking-widest">ScaleAI Intelligence</p>
          <p className="text-text-secondary text-[10px] font-mono">
            {tips.length > 0 ? `${tips.length} tip${tips.length !== 1 ? 's' : ''} ready` : 'Ask for strategy'}
          </p>
        </div>
        <span className="text-text-secondary text-xs group-hover:text-neon-cyan transition-colors ml-auto">▼</span>
      </button>
    );
  }

  // ── Expanded panel ────────────────────────────────────────────────────────
  const panelBorder = isLive ? 'rgba(6,214,240,0.25)' : 'rgba(139,92,246,0.35)';
  const panelGlow   = isLive ? '0 0 40px rgba(6,214,240,0.08), 0 0 80px rgba(6,214,240,0.04)' : '0 0 20px rgba(139,92,246,0.1)';

  return (
    <div className="rounded-2xl overflow-hidden animate-fade-in-up"
      style={{
        background: 'linear-gradient(135deg, #0b0617 0%, #0f0c20 50%, #080514 100%)',
        border: `1px solid ${panelBorder}`,
        boxShadow: panelGlow,
      }}>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b"
        style={{ borderColor: 'rgba(26,32,48,0.8)', background: 'rgba(11,6,23,0.8)' }}>
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm animate-float"
              style={{ background: 'rgba(6,214,240,0.12)', border: '1px solid rgba(6,214,240,0.35)' }}>
              🤖
            </div>
            <span className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border-2 ${
              isLive ? 'bg-neon-cyan animate-pulse-cyan' : 'bg-learning-blue'
            }`} style={{ borderColor: '#0b0617' }} />
          </div>
          <div>
            <p className="text-white font-bold text-xs uppercase tracking-widest">ScaleAI Intelligence</p>
            <p className="text-text-secondary text-[10px] font-mono">
              {isLive ? '● Live engine' : '● Demo mode'}
              {tipsAt ? ` · refreshed ${tipsAt}` : ''}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Tab pills */}
          <div className="flex rounded-lg p-0.5" style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(26,32,48,0.6)' }}>
            {(['tips', 'chat', 'log'] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest transition-all ${
                  activeTab === tab
                    ? 'text-neon-cyan'
                    : 'text-text-secondary hover:text-white'
                }`}
                style={activeTab === tab ? { background: 'rgba(6,214,240,0.12)', border: '1px solid rgba(6,214,240,0.25)' } : {}}>
                {tab === 'tips' ? '💡 Tips' : tab === 'chat' ? '💬 Chat' : '📋 Log'}
              </button>
            ))}
          </div>
          <button onClick={() => setIsOpen(false)}
            className="w-7 h-7 flex items-center justify-center text-text-secondary hover:text-white rounded-lg transition-colors text-xs"
            style={{ background: 'rgba(0,0,0,0.2)' }}>
            ✕
          </button>
        </div>
      </div>

      {/* ── TIPS TAB ──────────────────────────────────────────────────────── */}
      {activeTab === 'tips' && (
        <div className="p-4 flex flex-col gap-3">
          {tips.length === 0 ? (
            <div className="flex items-center justify-center h-24 text-text-secondary text-sm font-mono">
              <span className="animate-pulse">Analyzing live data…</span>
            </div>
          ) : (
            tips.map((tip, i) => {
              const style = URGENCY[tip.urgency] ?? URGENCY.opportunity;
              return (
                <div key={i} className={`rounded-xl border p-3.5 ${style.border}`}
                  style={{ background: 'rgba(16,21,32,0.7)' }}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${style.dot}`} />
                    <span className="text-[9px] font-bold font-mono tracking-widest uppercase"
                      style={{ color: tip.urgency === 'critical' ? '#ef4444' : tip.urgency === 'warning' ? '#f59e0b' : '#06D6F0' }}>
                      {style.icon} {style.label}
                    </span>
                  </div>
                  <p className="text-white text-xs font-bold mb-1.5 leading-snug">{tip.title}</p>
                  <p className="text-white/70 text-[11px] leading-relaxed">
                    <Typewriter text={tip.body} />
                  </p>
                  {tip.action && <ActionButton action={tip.action} isLive={isLive} />}
                </div>
              );
            })
          )}
          <button onClick={fetchTips}
            className="mt-1 text-[10px] font-mono text-text-secondary hover:text-neon-cyan transition-colors text-center">
            ↺ Refresh recommendations
          </button>
        </div>
      )}

      {/* ── CHAT TAB ──────────────────────────────────────────────────────── */}
      {activeTab === 'chat' && (
        <div className="flex flex-col h-80">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2.5">
            {messages.length === 0 && (
              <div className="text-text-secondary text-xs font-mono text-center mt-6 leading-relaxed">
                Ask me anything about your live<br />Budo ↔ Meta bridge.
              </div>
            )}

            {messages.map(msg => (
              <div key={msg.id} className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold mt-0.5 ${
                  msg.role === 'user'
                    ? 'text-neon-cyan border border-neon-cyan/40'
                    : 'text-neon-cyan border border-neon-cyan/20'
                }`} style={{ background: 'rgba(6,214,240,0.08)' }}>
                  {msg.role === 'user' ? 'U' : '🤖'}
                </div>
                <div className={`max-w-[85%] rounded-xl px-3 py-2 text-[11px] leading-relaxed border ${
                  msg.role === 'user'
                    ? 'text-white rounded-tr-sm border-neon-cyan/15'
                    : 'text-white/90 rounded-tl-sm border-obsidian-border'
                }`} style={{ background: 'rgba(16,21,32,0.8)' }}>
                  {msg.content === '' ? (
                    <span className="inline-block w-1.5 h-3 bg-neon-cyan animate-pulse rounded-sm" />
                  ) : (
                    <p className="whitespace-pre-line">{renderBold(msg.content)}</p>
                  )}
                </div>
              </div>
            ))}

            {isTyping && messages[messages.length - 1]?.content !== '' && (
              <div className="flex gap-2">
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs border border-neon-cyan/20"
                  style={{ background: 'rgba(6,214,240,0.08)' }}>🤖</div>
                <div className="rounded-xl rounded-tl-sm px-3 py-2 flex items-center gap-1 border border-obsidian-border"
                  style={{ background: 'rgba(16,21,32,0.8)' }}>
                  {[0,1,2].map(i => (
                    <span key={i} className="w-1.5 h-1.5 bg-neon-cyan/60 rounded-full animate-bounce"
                      style={{ animationDelay: `${i * 0.15}s` }} />
                  ))}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Quick prompts */}
          <div className="px-4 pb-2 flex gap-1.5 overflow-x-auto">
            {QUICK_BRIDGE_PROMPTS.map(p => (
              <button key={p} onClick={() => sendMessage(p)} disabled={isTyping}
                className="shrink-0 text-[10px] px-2.5 py-1 border text-text-secondary
                  hover:border-neon-cyan/40 hover:text-neon-cyan rounded-full uppercase tracking-wider
                  transition-all duration-150 disabled:opacity-40 whitespace-nowrap"
                style={{ background: 'rgba(0,0,0,0.3)', borderColor: 'rgba(26,32,48,0.8)' }}>
                {p}
              </button>
            ))}
          </div>

          {/* Input */}
          <div className="px-4 pb-4 pt-1 border-t" style={{ borderColor: 'rgba(26,32,48,0.6)' }}>
            <div className={`flex items-center gap-2 rounded-xl px-3 py-2 transition-all border ${
              input ? 'border-neon-cyan/40' : 'border-obsidian-border'
            }`} style={{ background: 'rgba(16,21,32,0.8)' }}>
              <input
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') sendMessage(input); }}
                placeholder="Ask about your campaigns…"
                className="flex-1 bg-transparent text-white text-[11px] outline-none placeholder-muted-gray"
              />
              <button onClick={() => sendMessage(input)} disabled={!input.trim() || isTyping}
                className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs transition-all ${
                  input.trim() && !isTyping
                    ? 'bg-neon-cyan text-obsidian hover:opacity-90'
                    : 'text-text-secondary cursor-not-allowed'
                }`} style={!input.trim() || isTyping ? { background: 'rgba(26,32,48,0.6)' } : {}}>
                ↑
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── LOG TAB ───────────────────────────────────────────────────────── */}
      {activeTab === 'log' && (
        <div className="flex flex-col">
          <div className="flex items-center justify-between px-4 py-2.5 border-b" style={{ borderColor: 'rgba(26,32,48,0.6)' }}>
            <p className="text-text-secondary text-[10px] font-mono uppercase tracking-widest">Recent Engine Actions</p>
            <span className={`flex items-center gap-1.5 text-[10px] font-mono ${isLive ? 'text-neon-cyan' : 'text-text-secondary'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isLive ? 'bg-neon-cyan animate-pulse-cyan' : 'bg-muted-gray'}`} />
              {isLive ? 'Live' : 'Demo'}
            </span>
          </div>

          <div className="overflow-y-auto max-h-64 divide-y" style={{ borderColor: 'rgba(26,32,48,0.4)' }}>
            {logEntries.length === 0 ? (
              <div className="flex items-center justify-center h-20 text-text-secondary text-xs font-mono">
                No actions recorded yet
              </div>
            ) : (
              logEntries.map((entry, i) => (
                <div key={i} className="flex items-start gap-3 px-4 py-3 hover:bg-white/[0.02] transition-colors"
                  style={{ borderColor: 'rgba(26,32,48,0.4)' }}>
                  {/* Action label */}
                  <span className={`text-[10px] font-mono font-black shrink-0 mt-0.5 w-14 text-right ${
                    entry.action === 'SCALE'  ? 'text-neon-cyan' :
                    entry.action === 'PAUSE'  ? 'text-danger-red' :
                    entry.action === 'RESUME' ? 'text-profit-emerald' :
                    entry.action === 'BLOCK'  ? 'text-cyber-amber' : 'text-text-secondary'
                  }`}>{entry.action}</span>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-[11px] font-mono truncate leading-snug">{entry.adSetName}</p>
                    {entry.roas != null && (
                      <p className="text-text-secondary text-[10px]">ROAS {entry.roas.toFixed(2)}x</p>
                    )}
                    {entry.reason && (
                      <p className="text-text-secondary text-[9px] truncate mt-0.5">{entry.reason}</p>
                    )}
                  </div>

                  {/* Time */}
                  <span className="text-text-secondary text-[10px] font-mono shrink-0">{entry.ago ?? '—'}</span>
                </div>
              ))
            )}
          </div>

          <div className="px-4 py-2.5 text-[10px] font-mono text-text-secondary text-center border-t" style={{ borderColor: 'rgba(26,32,48,0.4)' }}>
            {isLive ? 'Showing last actions from current run' : 'Demo data — start backend for live log'}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Mock tip generator (offline fallback) ────────────────────────────────────

function generateMockTips(pairs: CampaignPair[], siteHealth: string, bugPage: string | null): Tip[] {
  const tips: Tip[] = [];

  if (siteHealth === 'BUG_DETECTED') {
    tips.push({
      urgency: 'critical',
      title:   'Site Bug Detected — Campaigns Paused',
      body:    `A bug was detected on /${bugPage ?? 'your site'}. ScaleAI has automatically paused all active campaigns to prevent wasted spend. Fix the issue, then resume campaigns from the Live Bridge table.`,
      adSetId: null, adSetName: null, action: null,
    });
  }

  // Stockout imminent: high-ROAS campaign with ETS < 6h
  const stockoutRisks = pairs.filter(p => p.etsHours != null && p.etsHours < 6 && p.roas != null && p.roas > 5.0);
  stockoutRisks.slice(0, 1).forEach(p => {
    tips.push({
      urgency:  'critical',
      title:    `⏱ Stockout in ${p.etsHours!.toFixed(1)}h — "${p.productName}"`,
      body:     `"${p.productName}" is performing at **${p.roas?.toFixed(2)}x ROAS** but will run out of stock in approximately **${p.etsHours!.toFixed(1)} hours** at current velocity (${p.salesVelocity?.toFixed(1) ?? '?'} units/hr). ` +
                `I recommend a **20% budget reduction** to stretch the remaining inventory until the next restock.`,
      adSetId: p.adSetId, adSetName: p.adSetName, etsHours: p.etsHours,
      action: { type: 'scale_budget', adSetId: p.adSetId, adSetName: p.adSetName, factor: 0.80, label: 'Apply −20% Budget Reduction' },
    });
  });

  // Low stock on scaling campaign (no ETS data)
  const lowStock = pairs.filter(p => p.liveDecision === 'SCALE' && p.inventory !== null && p.inventory <= 15 && (p.etsHours == null || p.etsHours >= 6));
  lowStock.slice(0, 1).forEach(p => {
    tips.push({
      urgency: 'critical', title: `Stock Alert: "${p.productName}"`,
      body:    `Scaling at **ROAS ${p.roas?.toFixed(2) ?? '?'}x** but only **${p.inventory} units** left. Consider reducing scale to +10% to avoid stockout and wasted ad spend.`,
      adSetId: p.adSetId, adSetName: p.adSetName,
      action: { type: 'scale_budget', adSetId: p.adSetId, adSetName: p.adSetName, factor: 1.10, label: 'Apply Conservative +10% Scale' },
    });
  });

  // Funnel-blocked scaling opportunity
  const funnelHolds = pairs.filter(p => p.liveDecision === 'HOLD' && p.roas !== null && p.roas > 5.0);
  funnelHolds.slice(0, 1).forEach(p => {
    tips.push({
      urgency: 'opportunity', title: `Unlock "${p.productName}"`,
      body:    `**ROAS ${p.roas?.toFixed(2)}x** — ready to scale, but blocked by funnel drop-off. Fix checkout UX friction and ScaleAI will automatically apply the +15% budget increase next cycle.`,
      adSetId: p.adSetId, adSetName: p.adSetName, action: null,
    });
  });

  if (tips.length === 0) {
    tips.push({
      urgency: 'opportunity', title: 'System Operating Normally',
      body:    `**${pairs.filter(p => p.liveDecision === 'SCALE').length} campaigns scaling**, ${pairs.filter(p => p.liveDecision === 'PAUSE').length} paused. No critical alerts. Your automated engine is optimizing within safe parameters.`,
      adSetId: null, adSetName: null, action: null,
    });
  }

  return tips.slice(0, 3);
}

export default BridgeCoachPanel;
