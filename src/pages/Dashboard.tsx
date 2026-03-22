import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Settings, ExternalLink, TrendingUp,
  Activity, RefreshCw, Pause, Play,
  ChevronDown, ChevronUp,
  Circle, X, Plus, Sparkles,
} from 'lucide-react';
import { AgentProvider, useAgentBus } from '../agents/AgentContext';
import type { AgentMessage } from '../agents/types';
import { NewCampaignConversation } from '../components/NewCampaignConversation';
import { ZipitAnalyst } from '../components/ZipitAnalyst';
import { AICoachChat } from '../components/AICoachChat';
import { BrandingSettings } from '../components/BrandingSettings';
import { ConnectionMap } from '../components/ConnectionMap';
import { MetaLiveFeed } from '../components/MetaLiveFeed';
import { SiteHealthHub } from '../components/SiteHealthHub';
import { AICreativeSuite } from '../components/AICreativeSuite';
import { ToastProvider, useToast } from '../components/Toast';
import { useBrand } from '../lib/BrandingService';
import { useSiteHealth } from '../lib/SiteHealthService';
import type { CampaignPair } from '../components/CampaignView';

// ─── Local types ───────────────────────────────────────────────────────────────

interface StatusResponse {
  lastUpdated: string;
  lastRunAt: string | null;
  runCount: number;
  accountId: string;
  siteHealth: string;
  bugPage: string | null;
  pairs: CampaignPair[];
  totalWasteSavedUsd?: number;
  activeSafetyPauses?: { name: string; reason: string; pausedAt: string; estimatedWasteSavedUsd: number }[];
  globalDailyMaxUsd?: number;
  totalBudgetUsd?: number;
}

// ─── Mock campaign data ────────────────────────────────────────────────────────

const MOCK_PAIRS: CampaignPair[] = [
  {
    productId: 101, productName: 'Budo Pro Gloves', category: 'Combat Equipment',
    adSetId: '23850001', adSetName: 'Budo – Sports Gear Retargeting',
    campaignName: 'Budo | Retargeting | Purchases', campaignObjective: 'PURCHASES',
    adSetStatus: 'ACTIVE', dailyBudgetUsd: 50.00, roas: 6.2, spend: 23.50, inventory: 42,
    impressions: 18400, reach: 12100, results: 31, costPerResult: 7.58, ctr: 2.84, cpm: 12.77, frequency: 1.52,
    siteHealth: 'OK', dropOff: { cart: 'LOW', checkout: 'LOW' },
    liveDecision: 'SCALE', liveDecisionReason: 'ROAS 6.20 > 5.0 AND inventory 42 > 10',
    lastAction: 'SCALE', lastActionAt: null, lastActionAgo: '8m ago', lastActionReason: 'ROAS 6.20 > 5.0',
  },
  {
    productId: 102, productName: 'Budo Summer Training Gi', category: 'Apparel',
    adSetId: '23850002', adSetName: 'Budo – Summer Collection Prospecting',
    campaignName: 'Budo | Prospecting | Purchases', campaignObjective: 'PURCHASES',
    adSetStatus: 'ACTIVE', dailyBudgetUsd: 35.00, roas: 4.1, spend: 18.00, inventory: 8,
    impressions: 22600, reach: 19800, results: 14, costPerResult: 12.86, ctr: 1.91, cpm: 7.96, frequency: 1.14,
    siteHealth: 'OK', dropOff: { cart: 'LOW', checkout: 'LOW' },
    liveDecision: 'HOLD', liveDecisionReason: 'ROAS 4.10 in optimize range (3.0–5.0)',
    lastAction: 'HOLD', lastActionAt: null, lastActionAgo: '23m ago', lastActionReason: 'ROAS in range',
  },
  {
    productId: 103, productName: 'Budo Elite Foot Protectors', category: 'Premium Gear',
    adSetId: '23850003', adSetName: 'Budo – Premium Products Retargeting',
    campaignName: 'Budo | Premium | Purchases', campaignObjective: 'PURCHASES',
    adSetStatus: 'PAUSED', dailyBudgetUsd: 60.00, roas: 1.8, spend: 41.00, inventory: 1,
    impressions: 31200, reach: 14700, results: 9, costPerResult: 45.56, ctr: 3.42, cpm: 13.14, frequency: 2.12,
    siteHealth: 'OK', dropOff: { cart: 'HIGH', checkout: 'LOW' },
    liveDecision: 'PAUSE', liveDecisionReason: 'Critical inventory: 1 units < 2',
    lastAction: 'PAUSE', lastActionAt: null, lastActionAgo: '2m ago', lastActionReason: 'Critical inventory',
  },
  {
    productId: 104, productName: 'Budo Sparring Accessories Pack', category: 'Accessories',
    adSetId: '23850004', adSetName: 'Budo – Accessories Bundle',
    campaignName: 'Budo | Accessories | Purchases', campaignObjective: 'PURCHASES',
    adSetStatus: 'ACTIVE', dailyBudgetUsd: 28.00, roas: 5.9, spend: 12.00, inventory: 65,
    impressions: 9800, reach: 8300, results: 18, costPerResult: 6.67, ctr: 2.21, cpm: 12.24, frequency: 1.18,
    siteHealth: 'OK', dropOff: { cart: 'LOW', checkout: 'HIGH' },
    liveDecision: 'HOLD', liveDecisionReason: 'High drop-off at checkout prevents scale',
    lastAction: 'HOLD', lastActionAt: null, lastActionAgo: '8m ago', lastActionReason: 'High drop-off',
  },
  {
    productId: 105, productName: 'Budo Kids Starter Set', category: 'Kids',
    adSetId: '23850005', adSetName: 'Budo – Kids Collection',
    campaignName: 'Budo | Kids | Purchases', campaignObjective: 'PURCHASES',
    adSetStatus: 'ACTIVE', dailyBudgetUsd: 20.00, roas: 7.1, spend: 8.50, inventory: 84,
    impressions: 7100, reach: 6600, results: 22, costPerResult: 3.86, ctr: 3.07, cpm: 11.97, frequency: 1.08,
    siteHealth: 'OK', dropOff: { cart: 'LOW', checkout: 'LOW' },
    liveDecision: 'SCALE', liveDecisionReason: 'ROAS 7.10 > 5.0 AND inventory 84 > 10',
    lastAction: null, lastActionAt: null, lastActionAgo: null, lastActionReason: null,
  },
];

// ─── Helpers ───────────────────────────────────────────────────────────────────


const API_BASE = 'http://localhost:3001';
const POLL_MS  = 10_000;


// ─── Decision cell ─────────────────────────────────────────────────────────────

const DecisionCell: React.FC<{ decision: CampaignPair['liveDecision']; reason: string }> = ({ decision, reason }) => {
  const cfg = {
    SCALE: { icon: TrendingUp, label: 'Scale', color: 'var(--brand-primary)' },
    HOLD:  { icon: Activity,   label: 'Hold',  color: '#6b7280'              },
    PAUSE: { icon: Pause,      label: 'Pause', color: '#ef4444'              },
  }[decision] ?? { icon: Circle, label: decision, color: '#6b7280' };
  const Icon = cfg.icon;
  return (
    <div className="flex items-center gap-1.5" title={reason}>
      <Icon size={11} style={{ color: cfg.color, flexShrink: 0 }} />
      <span className="text-[11px] font-mono font-bold uppercase tracking-wider" style={{ color: cfg.color }}>
        {cfg.label}
      </span>
    </div>
  );
};

// ─── Row action buttons ────────────────────────────────────────────────────────

const RowActions: React.FC<{ pair: CampaignPair; isLive: boolean; onRefresh: () => void }> = ({ pair, isLive, onRefresh }) => {
  const toast  = useToast();
  const [busy, setBusy] = useState(false);

  const act = async (type: 'pause' | 'resume' | 'scale_budget', factor?: number) => {
    if (!isLive) {
      toast({ variant: 'info', title: 'Demo Mode', body: 'Start the backend to apply real actions.' });
      return;
    }
    setBusy(true);
    try {
      const res  = await fetch(`${API_BASE}/api/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, adSetId: pair.adSetId, adSetName: pair.adSetName, factor }),
      });
      const json = await res.json();
      if (json.success) { toast({ variant: 'meta', title: 'Confirmed', body: json.message }); onRefresh(); }
      else toast({ variant: 'error', title: 'Action Failed', body: json.error ?? 'Unknown error' });
    } catch {
      toast({ variant: 'error', title: 'Unreachable', body: 'Start the API server on port 3001.' });
    } finally { setBusy(false); }
  };

  const isActive = pair.adSetStatus === 'ACTIVE';
  const btn = 'flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono font-bold transition-colors disabled:opacity-40';

  return (
    <div className="flex items-center gap-1.5">
      {isActive ? (
        <>
          <button onClick={() => act('pause')} disabled={busy} className={btn}
            style={{ border: '1px solid rgba(239,68,68,0.35)', color: '#ef4444' }}>
            <Pause size={9} /> Pause
          </button>
          <button onClick={() => act('scale_budget', 1.15)} disabled={busy} className={btn}
            style={{ border: '1px solid color-mix(in srgb, var(--brand-primary) 40%, transparent)', color: 'var(--brand-primary)' }}>
            <TrendingUp size={9} /> +15%
          </button>
        </>
      ) : (
        <button onClick={() => act('resume')} disabled={busy} className={btn}
          style={{ border: '1px solid rgba(16,185,129,0.35)', color: '#10b981' }}>
          <Play size={9} /> Resume
        </button>
      )}
    </div>
  );
};

// ─── Stat box ──────────────────────────────────────────────────────────────────

const StatBox: React.FC<{
  label: string; value: string; sub?: string;
  accent?: boolean; alert?: boolean; onClick?: () => void;
}> = ({ label, value, sub, accent, alert, onClick }) => (
  <div
    className="rounded border p-5 flex flex-col gap-2"
    onClick={onClick}
    style={{
      background: 'var(--brand-surface-card)',
      borderColor: accent ? 'color-mix(in srgb, var(--brand-primary) 40%, transparent)'
                  : alert  ? 'rgba(239,68,68,0.4)'
                  : 'var(--brand-muted)',
      cursor: onClick ? 'pointer' : 'default',
    }}
    onMouseEnter={e => { if (onClick) (e.currentTarget as HTMLElement).style.borderColor = accent ? 'color-mix(in srgb, var(--brand-primary) 60%, transparent)' : 'rgba(255,255,255,0.15)'; }}
    onMouseLeave={e => { if (onClick) (e.currentTarget as HTMLElement).style.borderColor = accent ? 'color-mix(in srgb, var(--brand-primary) 40%, transparent)' : alert ? 'rgba(239,68,68,0.4)' : 'var(--brand-muted)'; }}
  >
    <span className="text-[10px] font-mono uppercase tracking-widest" style={{ color: '#6b7280' }}>
      {label}
    </span>
    <p className="font-black text-2xl leading-none" style={{
      color: accent ? 'var(--brand-primary)' : alert ? '#ef4444' : '#ffffff',
      fontFamily: 'var(--font-display)',
    }}>
      {value}
    </p>
    {sub && <p className="text-[11px]" style={{ color: '#6b7280' }}>{sub}</p>}
  </div>
);

// ─── Agent Carousel ────────────────────────────────────────────────────────────

const AGENT_CARDS = [
  {
    id:           'analyst'   as const,
    Icon:         Activity,
    name:         'Analyst',
    accent:       '#06b6d4',
    tagline:      'Campaign Intelligence',
    description:  'Continuously monitors ROAS, spend, and creative performance across all your ad sets. Surfaces scaling opportunities and flags budget waste before it compounds.',
    capabilities: ['ROAS & CPA real-time tracking', 'Creative fatigue detection', 'Auto Scale / Hold / Pause logic'],
  },
  {
    id:           'campaigner' as const,
    Icon:         TrendingUp,
    name:         'Campaigner',
    accent:       'var(--brand-primary)',
    tagline:      'AI Ad Builder',
    description:  'Launch full Meta campaigns through conversation. Describe your audience and goal — the agent handles structure, targeting, and budgets via the live Meta Ads API.',
    capabilities: ['Natural language campaign setup', 'Meta Ads API live connection', 'Ad set & budget management'],
  },
  {
    id:           'creative' as const,
    Icon:         Sparkles,
    name:         'AI Creative',
    accent:       '#a78bfa',
    tagline:      'Image · Video · Copy',
    description:  'Generate scroll-stopping ad creatives in seconds — product images, cinematic video clips, and high-converting ad copy, all powered by AI.',
    capabilities: ['Flux Schnell image generation', 'Luma Ray 2 video generation', 'Claude-powered ad copy'],
  },
] as const;

type AgentCarouselId = (typeof AGENT_CARDS)[number]['id'];

const AgentCarousel: React.FC<{ onOpen: (id: AgentCarouselId) => void }> = ({ onOpen }) => {
  const [hovered, setHovered] = React.useState<number | null>(null);

  return (
    <section>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        {AGENT_CARDS.map((card, i) => {
          const { Icon, name, accent, tagline, description, capabilities } = card;
          const isHovered = hovered === i;
          return (
            <div
              key={card.id}
              onClick={() => onOpen(card.id)}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              style={{
                background:    'var(--brand-surface-card)',
                border:        `1px solid ${isHovered ? `color-mix(in srgb, ${accent} 45%, transparent)` : 'var(--brand-muted)'}`,
                borderRadius:  10,
                padding:       '20px',
                cursor:        'pointer',
                transition:    'border-color 0.2s, box-shadow 0.2s',
                position:      'relative',
                overflow:      'hidden',
                boxShadow:     isHovered ? `0 0 0 1px color-mix(in srgb, ${accent} 15%, transparent), 0 4px 20px rgba(0,0,0,0.3)` : 'none',
              }}
            >
              {/* Top accent line */}
              <div style={{
                position:   'absolute', top: 0, left: 0, right: 0, height: 2,
                background: isHovered ? `linear-gradient(90deg, ${accent}, transparent)` : 'transparent',
                transition: 'background 0.2s',
              }} />

              {/* Icon + Name */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 8,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: `color-mix(in srgb, ${accent} 12%, transparent)`,
                  border:     `1px solid color-mix(in srgb, ${accent} 25%, transparent)`,
                  flexShrink: 0,
                }}>
                  <Icon size={18} color={accent} />
                </div>
                <div>
                  <div style={{ color: '#fff', fontWeight: 800, fontSize: 14, lineHeight: 1 }}>{name}</div>
                  <div style={{ color: accent, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 3 }}>{tagline}</div>
                </div>
              </div>

              {/* Description */}
              <p style={{ color: '#9ca3af', fontSize: 12, lineHeight: 1.6, marginBottom: 14 }}>{description}</p>

              {/* Capabilities */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 18 }}>
                {capabilities.map(c => (
                  <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <div style={{ width: 4, height: 4, borderRadius: '50%', background: accent, flexShrink: 0, opacity: 0.7 }} />
                    <span style={{ color: '#6b7280', fontSize: 11 }}>{c}</span>
                  </div>
                ))}
              </div>

              {/* CTA */}
              <div style={{
                width: '100%', padding: '8px 14px', borderRadius: 6,
                border:      `1px solid color-mix(in srgb, ${accent} 30%, transparent)`,
                background:  `color-mix(in srgb, ${accent} ${isHovered ? '12%' : '6%'}, transparent)`,
                color:       accent, fontSize: 11, fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: '0.08em',
                textAlign:   'center', transition: 'background 0.2s',
              }}>
                Open {name} →
              </div>
            </div>
          );
        })}
      </div>

      {/* Dots */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 5, marginTop: 12 }}>
        {AGENT_CARDS.map((card, i) => (
          <div
            key={i}
            style={{
              width:        hovered === i ? 18 : 5,
              height:       5,
              borderRadius: 3,
              background:   hovered === i ? card.accent : 'rgba(255,255,255,0.08)',
              transition:   'all 0.25s',
            }}
          />
        ))}
      </div>
    </section>
  );
};

// ─── Side panel (shared shell) ─────────────────────────────────────────────────

const SidePanel: React.FC<{
  isOpen: boolean; onClose: () => void;
  title: string; accent?: string;
  width?: number; noScroll?: boolean;
  children: React.ReactNode;
}> = ({ isOpen, onClose, title, accent = '#ffffff', width = 480, noScroll, children }) => (
  <div
    className="fixed top-0 right-0 h-full z-40 flex flex-col"
    style={{
      width,
      background: 'var(--brand-surface)',
      borderLeft: '1px solid var(--brand-muted)',
      transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
      transition: 'transform 0.3s cubic-bezier(.4,0,.2,1)',
    }}
  >
    <div className="flex items-center justify-between px-6 py-4 border-b shrink-0"
      style={{ borderColor: 'var(--brand-muted)', background: 'var(--brand-surface)' }}>
      <span className="font-black text-xs uppercase tracking-widest" style={{ color: accent }}>{title}</span>
      <button onClick={onClose} className="p-1.5 rounded transition-colors hover:bg-white/10">
        <X size={14} color="#6b7280" />
      </button>
    </div>
    {noScroll
      ? <div className="flex-1 flex flex-col min-h-0">{children}</div>
      : <div className="flex-1 overflow-y-auto p-6">{children}</div>
    }
  </div>
);

// ─── Settings panel ────────────────────────────────────────────────────────────

const SettingsPanel: React.FC<{ isOpen: boolean; onClose: () => void; metaUrl: string }> = ({ isOpen, onClose, metaUrl }) => (
  <SidePanel isOpen={isOpen} onClose={onClose} title="Settings">
    <a
      href={metaUrl} target="_blank" rel="noopener noreferrer"
      className="flex items-center justify-between px-4 py-3 rounded-lg mb-6 transition-colors"
      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--brand-muted)', color: '#9ca3af', textDecoration: 'none' }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.15)'; (e.currentTarget as HTMLElement).style.color = '#fff'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--brand-muted)'; (e.currentTarget as HTMLElement).style.color = '#9ca3af'; }}
    >
      <span className="text-xs font-bold uppercase tracking-widest">Meta Ads Manager</span>
      <ExternalLink size={13} />
    </a>
    <BrandingSettings />
  </SidePanel>
);

// ─── Chat panel (AI Assistant) ─────────────────────────────────────────────────

const ChatPanel: React.FC<{ isOpen: boolean; onClose: () => void; dashboardContext: string }> = ({
  isOpen, onClose, dashboardContext,
}) => (
  <SidePanel isOpen={isOpen} onClose={onClose} title="AI Assistant" accent="#06b6d4" width={520}>
    <AICoachChat dashboardContext={dashboardContext} />
  </SidePanel>
);

// ─── Analyst chat panel ────────────────────────────────────────────────────────

const AnalystChatPanel: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const { state, dispatch } = useAgentBus();
  const conv      = state.conversations.analyst;
  const isRunning = conv.status === 'THINKING' || conv.status === 'WORKING';
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const ACCENT = '#06b6d4';

  useEffect(() => {
    if (isOpen) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conv.messages, isOpen]);

  const send = async () => {
    const msg = input.trim();
    if (!msg || isRunning) return;
    setInput('');
    await dispatch({ from: 'user', to: 'analyst', content: msg });
  };

  const messages = conv.messages.filter((m: AgentMessage) => m.from === 'user' || m.from === 'analyst');

  return (
    <SidePanel isOpen={isOpen} onClose={onClose} title="Zipit Analyst" accent={ACCENT} width={520} noScroll>

      {/* Message list */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {messages.length === 0 && !isRunning && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center" style={{ minHeight: 200 }}>
            <div className="w-12 h-12 rounded-xl flex items-center justify-center"
              style={{ background: `${ACCENT}18`, border: `1px solid ${ACCENT}40` }}>
              <Activity size={22} color={ACCENT} />
            </div>
            <p className="text-sm font-medium" style={{ color: '#9ca3af' }}>
              No analysis yet. Ask anything or wait for the auto-run.
            </p>
          </div>
        )}

        {messages.map(m => {
          const isUser = m.from === 'user';
          return (
            <div key={m.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
              <div style={{
                maxWidth: '85%',
                padding: '10px 14px',
                borderRadius: isUser ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                background: isUser ? `${ACCENT}22` : 'rgba(255,255,255,0.04)',
                border: `1px solid ${isUser ? `${ACCENT}40` : 'rgba(255,255,255,0.07)'}`,
                fontSize: 13,
                lineHeight: 1.6,
                color: isUser ? '#e2e8f0' : '#d1d5db',
                whiteSpace: 'pre-wrap',
              }}>
                {m.content}
              </div>
            </div>
          );
        })}

        {/* Thinking indicator */}
        {isRunning && (
          <div className="flex justify-start">
            <div style={{
              padding: '10px 14px', borderRadius: '12px 12px 12px 2px',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.07)',
            }}>
              <div className="flex gap-1">
                {[0, 150, 300].map(d => (
                  <span key={d} style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: ACCENT,
                    display: 'inline-block',
                    animation: `pulse 1.4s ease-in-out ${d}ms infinite`,
                  }} />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="shrink-0 px-4 py-4 border-t" style={{ borderColor: 'var(--brand-muted)' }}>
        <div className="flex gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Ask the analyst anything…"
            disabled={isRunning}
            style={{
              flex: 1, background: 'rgba(0,0,0,0.25)',
              border: '1px solid var(--brand-muted)', borderRadius: 8,
              color: '#fff', fontSize: 13, padding: '10px 14px',
              outline: 'none', fontFamily: 'inherit',
              opacity: isRunning ? .5 : 1,
            }}
          />
          <button
            onClick={send}
            disabled={!input.trim() || isRunning}
            style={{
              padding: '10px 16px', borderRadius: 8,
              border: 'none',
              background: input.trim() && !isRunning ? ACCENT : 'rgba(6,182,212,0.15)',
              color: input.trim() && !isRunning ? '#000' : '#374151',
              fontSize: 12, fontWeight: 700, cursor: input.trim() && !isRunning ? 'pointer' : 'not-allowed',
            }}
          >
            Send
          </button>
        </div>
      </div>
    </SidePanel>
  );
};


// ─── Chief Agent (Orchestrator) chat panel ─────────────────────────────────────

const OrchestratorChatPanel: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const { state, dispatch } = useAgentBus();
  const conv      = state.conversations.orchestrator;
  const isRunning = conv.status === 'THINKING' || conv.status === 'WORKING';
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const ACCENT = '#a78bfa';

  useEffect(() => {
    if (isOpen) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conv.messages, isOpen]);

  const send = async () => {
    const msg = input.trim();
    if (!msg || isRunning) return;
    setInput('');
    await dispatch({ from: 'user', to: 'orchestrator', content: msg });
  };

  const messages = conv.messages.filter((m: AgentMessage) => m.from === 'user' || m.from === 'orchestrator');

  return (
    <SidePanel isOpen={isOpen} onClose={onClose} title="Chief Agent" accent={ACCENT} width={540} noScroll>

      {/* Sub-agent status pill */}
      {isRunning && conv.lastAction && conv.lastAction !== 'Analyzing…' && (
        <div className="shrink-0 px-6 py-2 border-b flex items-center gap-2" style={{ borderColor: 'var(--brand-muted)' }}>
          <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: ACCENT }} />
          <span className="text-[11px] font-mono" style={{ color: '#6b7280' }}>{conv.lastAction}</span>
        </div>
      )}

      {/* Message list */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {messages.length === 0 && !isRunning && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center" style={{ minHeight: 200 }}>
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{ background: `${ACCENT}18`, border: `1px solid ${ACCENT}40` }}>
              <Sparkles size={24} color={ACCENT} />
            </div>
            <div>
              <p className="text-sm font-bold text-white mb-1">Chief Agent</p>
              <p className="text-xs" style={{ color: '#6b7280' }}>
                Orchestrates Analyst · Creative · Campaigner
              </p>
            </div>
            <div className="mt-2 space-y-2 w-full max-w-xs">
              {[
                'Analyze top campaigns and suggest a new creative',
                'Which ad sets should I scale today?',
                'Generate an image ad for our best product',
              ].map(s => (
                <button key={s} onClick={() => setInput(s)}
                  className="w-full text-left text-[11px] px-3 py-2 rounded-lg transition-colors"
                  style={{ background: `${ACCENT}0d`, border: `1px solid ${ACCENT}25`, color: '#9ca3af' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = `${ACCENT}55`; (e.currentTarget as HTMLElement).style.color = '#d1d5db'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = `${ACCENT}25`; (e.currentTarget as HTMLElement).style.color = '#9ca3af'; }}>
                  "{s}"
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map(m => {
          const isUser = m.from === 'user';
          return (
            <div key={m.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
              {!isUser && (
                <div className="w-6 h-6 rounded-lg flex items-center justify-center mr-2 mt-0.5 shrink-0"
                  style={{ background: `${ACCENT}18`, border: `1px solid ${ACCENT}40` }}>
                  <Sparkles size={11} color={ACCENT} />
                </div>
              )}
              <div style={{
                maxWidth: '82%',
                padding: '10px 14px',
                borderRadius: isUser ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                background: isUser ? `${ACCENT}22` : 'rgba(255,255,255,0.04)',
                border: `1px solid ${isUser ? `${ACCENT}40` : 'rgba(255,255,255,0.07)'}`,
                fontSize: 13, lineHeight: 1.65,
                color: isUser ? '#e2e8f0' : '#d1d5db',
                whiteSpace: 'pre-wrap',
              }}>
                {m.content}
              </div>
            </div>
          );
        })}

        {isRunning && (
          <div className="flex justify-start items-center gap-2">
            <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: `${ACCENT}18`, border: `1px solid ${ACCENT}40` }}>
              <Sparkles size={11} color={ACCENT} />
            </div>
            <div style={{
              padding: '10px 14px', borderRadius: '12px 12px 12px 2px',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.07)',
            }}>
              <div className="flex gap-1">
                {[0, 150, 300].map(d => (
                  <span key={d} style={{
                    width: 6, height: 6, borderRadius: '50%', background: ACCENT,
                    display: 'inline-block',
                    animation: `pulse 1.4s ease-in-out ${d}ms infinite`,
                  }} />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="shrink-0 px-4 py-4 border-t" style={{ borderColor: 'var(--brand-muted)' }}>
        <div className="flex gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Give the Chief Agent a mission…"
            disabled={isRunning}
            style={{
              flex: 1, background: 'rgba(0,0,0,0.25)',
              border: '1px solid var(--brand-muted)', borderRadius: 8,
              color: '#fff', fontSize: 13, padding: '10px 14px',
              outline: 'none', fontFamily: 'inherit',
              opacity: isRunning ? .5 : 1,
            }}
          />
          <button
            onClick={send}
            disabled={!input.trim() || isRunning}
            style={{
              padding: '10px 16px', borderRadius: 8, border: 'none',
              background: input.trim() && !isRunning ? ACCENT : `${ACCENT}22`,
              color: input.trim() && !isRunning ? '#000' : '#374151',
              fontSize: 12, fontWeight: 700,
              cursor: input.trim() && !isRunning ? 'pointer' : 'not-allowed',
            }}
          >
            Send
          </button>
        </div>
      </div>
    </SidePanel>
  );
};

// ─── Inner dashboard (needs ToastProvider) ─────────────────────────────────────

const DashboardInner: React.FC = () => {
  const brand = useBrand();

  // ── Panel state ──────────────────────────────────────────────────────────────
  const [settingsOpen,        setSettingsOpen]        = useState(false);
  const [chatOpen,            setChatOpen]            = useState(false);
  const [analystChatOpen,     setAnalystChatOpen]     = useState(false);
  const [orchestratorOpen,    setOrchestratorOpen]    = useState(false);
  const [devOpen,        setDevOpen]        = useState(false);
  const [campaignPanelOpen, setCampaignPanelOpen] = useState(false);
  const [healthVisible, setHealthVisible] = useState(false);

  // ── Campaign polling ─────────────────────────────────────────────────────────
  const [statusData, setStatusData] = useState<StatusResponse | null>(null);
  const [isLive,     setIsLive]     = useState(false);
  const [lastFetch,  setLastFetch]  = useState<string | null>(null);
  const hasDataRef = useRef(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/status`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: StatusResponse = await res.json();
      setStatusData(json);
      setIsLive(true);
      hasDataRef.current = true;
    } catch {
      if (!hasDataRef.current) {
        setStatusData({
          lastUpdated: new Date().toISOString(), lastRunAt: null, runCount: 0,
          accountId: 'act_DEMO', siteHealth: 'OK', bugPage: null, pairs: MOCK_PAIRS,
        });
        hasDataRef.current = true;
      }
      setIsLive(false);
    } finally {
      setLastFetch(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const iv = setInterval(fetchStatus, POLL_MS);
    return () => clearInterval(iv);
  }, [fetchStatus]);

  const pairs = statusData?.pairs ?? MOCK_PAIRS;

  // ── Site health guard ────────────────────────────────────────────────────────
  const health = useSiteHealth(pairs);

  // ── Derived stats ────────────────────────────────────────────────────────────
  const totalSpend = pairs.reduce((s, p) => s + (p.spend ?? 0), 0);
  const roasPairs  = pairs.filter(p => p.roas !== null);
  const avgRoas    = roasPairs.length ? roasPairs.reduce((s, p) => s + p.roas!, 0) / roasPairs.length : 0;
  const wasteSaved = statusData?.totalWasteSavedUsd ?? 0;
  const siteHealth = statusData?.siteHealth ?? 'OK';
  const healthOk   = siteHealth === 'OK' || siteHealth === 'GREEN';

  const healthRef    = useRef<HTMLDivElement>(null);
  const creativeRef  = useRef<HTMLDivElement>(null);

  const dashboardContext = JSON.stringify({
    isLiveData: isLive, siteHealth,
    healthStatus: health.latest?.overallStatus ?? 'Unknown',
    campaigns: pairs.map(p => ({
      name: p.adSetName, status: p.adSetStatus,
      roas: p.roas, spend: p.spend, decision: p.liveDecision,
    })),
    summary: { totalSpend: totalSpend.toFixed(2), avgRoas: avgRoas.toFixed(2), wasteSaved: wasteSaved.toFixed(2) },
  }, null, 2);

  const accountNum = (statusData?.accountId ?? '').replace('act_', '');
  const metaUrl    = accountNum
    ? `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${accountNum}`
    : 'https://adsmanager.facebook.com';

  const navBtnStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: '6px',
    padding: '6px 12px', borderRadius: 'var(--radius-size)',
    border: '1px solid var(--brand-muted)',
    color: '#9ca3af', fontSize: '11px', fontWeight: 700,
    textTransform: 'uppercase', letterSpacing: '0.08em',
    cursor: 'pointer', background: 'transparent',
    transition: 'color 0.2s, border-color 0.2s',
  };

  const navActive: React.CSSProperties = {
    color: 'var(--brand-primary)',
    borderColor: 'color-mix(in srgb, var(--brand-primary) 40%, transparent)',
  };

  const hover = {
    enter: (e: React.MouseEvent) => {
      (e.currentTarget as HTMLElement).style.color = 'var(--brand-primary)';
      (e.currentTarget as HTMLElement).style.borderColor = 'color-mix(in srgb, var(--brand-primary) 40%, transparent)';
    },
    leave: (e: React.MouseEvent, active: boolean) => {
      if (!active) {
        (e.currentTarget as HTMLElement).style.color = '#9ca3af';
        (e.currentTarget as HTMLElement).style.borderColor = 'var(--brand-muted)';
      }
    },
  };

  return (
    <div className="min-h-screen" style={{ background: 'var(--brand-surface)' }}>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-30 flex items-center justify-between px-6 py-3 border-b"
        style={{ background: 'var(--brand-surface-card)', borderColor: 'var(--brand-muted)' }}
      >
        <div className="flex items-center gap-3">
          <img
            src={brand.logoUrl} alt={brand.name}
            className="w-7 h-7 rounded object-contain"
            style={{ background: `${brand.primary}18` }}
            onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          />
          <span className="font-black text-white text-sm uppercase tracking-widest" style={{ fontFamily: 'var(--font-display)' }}>
            {brand.name}
          </span>
          {!isLive && (
            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded"
              style={{ background: 'rgba(255,255,255,0.05)', color: '#6b7280', border: '1px solid rgba(255,255,255,0.08)' }}>
              DEMO
            </span>
          )}
        </div>

        <nav className="flex items-center gap-2">
          {/* Chief Agent — Orchestrator */}
          <button
            onClick={() => { setOrchestratorOpen(o => !o); setSettingsOpen(false); setAnalystChatOpen(false); setCampaignPanelOpen(false); }}
            style={{ ...navBtnStyle, ...(orchestratorOpen ? { color: '#a78bfa', borderColor: 'color-mix(in srgb,#a78bfa 40%,transparent)' } : {}) }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#a78bfa'; (e.currentTarget as HTMLElement).style.borderColor = 'color-mix(in srgb,#a78bfa 40%,transparent)'; }}
            onMouseLeave={e => { if (!orchestratorOpen) { (e.currentTarget as HTMLElement).style.color = '#9ca3af'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--brand-muted)'; } }}>
            <Sparkles size={12} /> Chief Agent
          </button>
          {/* Analyst */}
          <button
            onClick={() => { setAnalystChatOpen(o => !o); setOrchestratorOpen(false); setSettingsOpen(false); setCampaignPanelOpen(false); }}
            style={{ ...navBtnStyle, ...(analystChatOpen ? { color: '#06b6d4', borderColor: 'color-mix(in srgb,#06b6d4 40%,transparent)' } : {}) }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#06b6d4'; (e.currentTarget as HTMLElement).style.borderColor = 'color-mix(in srgb,#06b6d4 40%,transparent)'; }}
            onMouseLeave={e => { if (!analystChatOpen) { (e.currentTarget as HTMLElement).style.color = '#9ca3af'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--brand-muted)'; } }}>
            <Activity size={12} /> Analyst
          </button>
          {/* Campaigner */}
          <button
            onClick={() => { setCampaignPanelOpen(o => !o); setOrchestratorOpen(false); setAnalystChatOpen(false); setSettingsOpen(false); }}
            style={{ ...navBtnStyle, ...(campaignPanelOpen ? navActive : {}) }}
            onMouseEnter={hover.enter}
            onMouseLeave={e => hover.leave(e, campaignPanelOpen)}>
            <TrendingUp size={12} /> Campaigner
          </button>
          {/* AI Creative */}
          <button
            onClick={() => creativeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            style={{ ...navBtnStyle }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#a78bfa'; (e.currentTarget as HTMLElement).style.borderColor = 'color-mix(in srgb,#a78bfa 40%,transparent)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#9ca3af'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--brand-muted)'; }}>
            <Sparkles size={12} /> AI Creative
          </button>
          {/* Settings */}
          <button
            onClick={() => { setSettingsOpen(o => !o); setOrchestratorOpen(false); setAnalystChatOpen(false); setCampaignPanelOpen(false); }}
            style={{ ...navBtnStyle, ...(settingsOpen ? navActive : {}) }}
            onMouseEnter={hover.enter}
            onMouseLeave={e => hover.leave(e, settingsOpen)}>
            <Settings size={12} /> Settings
          </button>
        </nav>
      </header>

      {/* ── Main ────────────────────────────────────────────────────────────── */}
      <main
        className="max-w-screen-xl mx-auto px-6 py-8 space-y-10 transition-all duration-300"
        style={settingsOpen || campaignPanelOpen ? { marginRight: '500px' } : {}}
      >


        {/* ── Agent Carousel ────────────────────────────────────────────────── */}
        <AgentCarousel onOpen={(id) => {
          setOrchestratorOpen(false);
          setSettingsOpen(false);
          if (id === 'analyst') {
            setAnalystChatOpen(true);
            setCampaignPanelOpen(false);
          } else if (id === 'campaigner') {
            setCampaignPanelOpen(true);
            setAnalystChatOpen(false);
          } else {
            setAnalystChatOpen(false);
            setCampaignPanelOpen(false);
            creativeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }} />

        {/* ── Stat boxes ────────────────────────────────────────────────────── */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatBox
            label="Daily Spend"
            value={`$${totalSpend.toFixed(2)}`}
            sub={isLive ? 'Live from Meta' : 'Demo data'}
          />
          <StatBox
            label="Blended ROAS"
            value={roasPairs.length ? `${avgRoas.toFixed(2)}x` : '—'}
            sub={avgRoas > 5 ? 'Above scale threshold' : avgRoas > 3 ? 'Optimize range' : avgRoas > 0 ? 'Below floor' : 'No data'}
            accent={avgRoas >= 5}
            alert={avgRoas > 0 && avgRoas < 3}
          />
          <StatBox
            label="System Health"
            value={
              health.latest
                ? `Health: ${health.latest.overallStatus}`
                : healthOk ? 'Healthy' : siteHealth
            }
            sub={
              health.lastRunAt
                ? `Last check: ${health.lastRunAt} · ${health.latest?.functionalPct ?? 100}% functional`
                : healthOk
                ? `${pairs.filter(p => p.liveDecision === 'PAUSE').length} safety pauses active`
                : 'All ad sets paused'
            }
            accent={health.latest ? health.latest.overallStatus === 'Optimal' : healthOk}
            alert={health.latest ? health.latest.overallStatus === 'Critical' : !healthOk}
            onClick={() => {
              setHealthVisible(true);
              setTimeout(() => healthRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
            }}
          />
          <StatBox
            label="Total Savings"
            value={`$${wasteSaved.toFixed(2)}`}
            sub="Waste prevented by engine"
            accent={wasteSaved > 0}
          />
        </section>

        {/* ── Active Campaigns ──────────────────────────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <h2 className="text-white font-black text-sm uppercase tracking-widest" style={{ fontFamily: 'var(--font-display)' }}>
                Campaigns
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={fetchStatus}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider transition-colors"
                style={{ border: '1px solid var(--brand-muted)', color: '#6b7280', background: 'transparent' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--brand-primary)'; (e.currentTarget as HTMLElement).style.borderColor = 'color-mix(in srgb, var(--brand-primary) 40%, transparent)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#6b7280'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--brand-muted)'; }}
              >
                <RefreshCw size={10} /> Refresh
              </button>
              <button
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider transition-colors"
                style={{ border: '1px solid color-mix(in srgb, var(--brand-primary) 40%, transparent)', color: 'var(--brand-primary)', background: 'color-mix(in srgb, var(--brand-primary) 8%, transparent)' }}
                onClick={() => { setCampaignPanelOpen(true); setSettingsOpen(false); setChatOpen(false); }}
                title={isLive ? 'Create a new campaign via Meta API' : 'Preview campaign creation (demo)'}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'color-mix(in srgb, var(--brand-primary) 14%, transparent)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'color-mix(in srgb, var(--brand-primary) 8%, transparent)'; }}
              >
                <Plus size={10} /> Zipit Campaigner
              </button>
            </div>
          </div>

          <div className="rounded border overflow-hidden" style={{ background: 'var(--brand-surface-card)', borderColor: 'var(--brand-muted)' }}>
            {/* Table header — Meta Ads Manager style */}
            <div
              className="grid gap-0 px-4 py-2.5 border-b"
              style={{
                gridTemplateColumns: '2fr 72px 80px 90px 100px 80px 72px 80px 148px',
                borderColor: 'var(--brand-muted)',
                background: 'rgba(0,0,0,0.25)',
              }}
            >
              {['Campaign / Ad Set', 'Status', 'Budget', 'Spend', 'Impressions', 'Results', 'CPA', 'ROAS', 'AI Decision'].map(h => (
                <span key={h} className="text-[10px] font-mono uppercase tracking-widest" style={{ color: '#4b5563' }}>{h}</span>
              ))}
            </div>

            {pairs.map(pair => {
              const isActive = pair.adSetStatus === 'ACTIVE';
              const rowBg =
                pair.liveDecision === 'PAUSE' ? 'rgba(239,68,68,0.03)' :
                pair.liveDecision === 'SCALE' ? 'color-mix(in srgb, var(--brand-primary) 3%, transparent)' :
                'transparent';
              const roasColor = pair.roas == null ? '#4b5563' : pair.roas > 5 ? 'var(--brand-primary)' : pair.roas >= 3 ? '#ffffff' : '#ef4444';

              return (
                <div
                  key={pair.productId}
                  className="grid gap-0 px-4 py-3 border-b last:border-b-0 transition-colors"
                  style={{
                    gridTemplateColumns: '2fr 72px 80px 90px 100px 80px 72px 80px 148px',
                    borderColor: 'var(--brand-muted)',
                    background: rowBg,
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.02)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = rowBg; }}
                >
                  {/* Campaign / Ad Set */}
                  <div className="flex flex-col gap-0.5 min-w-0 pr-4">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-white text-xs font-semibold truncate">{pair.adSetName}</span>
                      {pair.campaignObjective && (
                        <span className="shrink-0 text-[9px] font-mono px-1.5 py-0.5 rounded uppercase tracking-wider"
                          style={{ background: 'rgba(255,255,255,0.06)', color: '#6b7280', border: '1px solid var(--brand-muted)' }}>
                          {pair.campaignObjective}
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] font-mono truncate" style={{ color: '#4b5563' }}>
                      {pair.campaignName ?? pair.productName}
                    </span>
                  </div>

                  {/* Status */}
                  <div className="flex items-center">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ background: isActive ? '#10b981' : '#6b7280' }}
                      />
                      <span className="text-[10px] font-mono" style={{ color: isActive ? '#10b981' : '#6b7280' }}>
                        {isActive ? 'Active' : 'Paused'}
                      </span>
                    </div>
                  </div>

                  {/* Budget */}
                  <div className="flex items-center">
                    <span className="text-xs font-mono tabular-nums" style={{ color: '#9ca3af' }}>
                      {pair.dailyBudgetUsd != null ? `$${pair.dailyBudgetUsd.toFixed(0)}/day` : '—'}
                    </span>
                  </div>

                  {/* Spend */}
                  <div className="flex items-center">
                    <span className="text-xs font-mono font-medium tabular-nums text-white">
                      {pair.spend != null ? `$${pair.spend.toFixed(2)}` : '—'}
                    </span>
                  </div>

                  {/* Impressions */}
                  <div className="flex items-center">
                    <span className="text-xs font-mono tabular-nums" style={{ color: '#9ca3af' }}>
                      {pair.impressions != null ? pair.impressions.toLocaleString() : '—'}
                    </span>
                  </div>

                  {/* Results (purchases) */}
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs font-mono font-bold tabular-nums text-white">
                      {pair.results != null ? pair.results : '—'}
                    </span>
                    {pair.results != null && (
                      <span className="text-[9px] font-mono" style={{ color: '#4b5563' }}>purchases</span>
                    )}
                  </div>

                  {/* CPA */}
                  <div className="flex items-center">
                    <span
                      className="text-xs font-mono tabular-nums"
                      style={{ color: pair.costPerResult == null ? '#4b5563' : pair.costPerResult < 10 ? '#10b981' : pair.costPerResult < 25 ? '#f59e0b' : '#ef4444' }}
                    >
                      {pair.costPerResult != null ? `$${pair.costPerResult.toFixed(2)}` : '—'}
                    </span>
                  </div>

                  {/* ROAS */}
                  <div className="flex items-center">
                    <span className="text-xs font-mono font-bold tabular-nums" style={{ color: roasColor }}>
                      {pair.roas != null ? `${pair.roas.toFixed(2)}x` : '—'}
                    </span>
                  </div>

                  {/* AI Decision + Actions */}
                  <div className="flex items-center gap-2">
                    <DecisionCell decision={pair.liveDecision} reason={pair.liveDecisionReason} />
                    <RowActions pair={pair} isLive={isLive} onRefresh={fetchStatus} />
                  </div>
                </div>
              );
            })}
          </div>

          {lastFetch && (
            <p className="text-[10px] font-mono mt-2" style={{ color: '#374151' }}>
              Last sync: {lastFetch} · Auto-refresh every 10s{statusData?.accountId ? ` · ${statusData.accountId}` : ''}
            </p>
          )}
        </section>

        {/* ── Site Health Hub ────────────────────────────────────────────────── */}
        <section ref={healthRef}>
          <button
            className="w-full flex items-center justify-between mb-4"
            onClick={() => setHealthVisible(o => !o)}
          >
            <div className="flex items-center gap-3">
              <h2 className="text-white font-black text-sm uppercase tracking-widest" style={{ fontFamily: 'var(--font-display)' }}>
                Site Health Hub
              </h2>
            </div>
            {healthVisible ? <ChevronUp size={14} color="#4b5563" /> : <ChevronDown size={14} color="#4b5563" />}
          </button>

          {healthVisible && (
            <SiteHealthHub
              latest={health.latest}
              history={health.history}
              checking={health.checking}
              lastRunAt={health.lastRunAt}
              nextRunIn={health.nextRunIn}
              onRunCheck={health.runCheck}
            />
          )}
        </section>

        {/* ── Zipit Analyst ─────────────────────────────────────────────────── */}
        <section>
          <ZipitAnalyst
            pairs={pairs}
            dashboardContext={dashboardContext}
            siteHealth={siteHealth}
            isLive={isLive}
            onOpenChat={() => setAnalystChatOpen(true)}
          />
        </section>


        {/* ── AI Creative Suite ──────────────────────────────────────────────── */}
        <section ref={creativeRef}>
          <div className="flex items-center gap-3 mb-4">
            <Sparkles size={14} color="#a78bfa" />
            <h2 className="text-white font-black text-sm uppercase tracking-widest" style={{ fontFamily: 'var(--font-display)' }}>
              AI Creative Suite
            </h2>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded" style={{ background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.3)', color: '#a78bfa' }}>
              Meta Ad Generator
            </span>
          </div>
          <AICreativeSuite />
        </section>


      </main>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <footer className="border-t px-6 py-4 mt-10" style={{ borderColor: 'var(--brand-muted)' }}>
        <div className="max-w-screen-xl mx-auto flex items-center justify-between">
          <p className="text-[10px] font-mono" style={{ color: '#374151' }}>
            ScaleAI · AI Marketing Intelligence
          </p>
          <button onClick={() => setDevOpen(o => !o)}
            className="flex items-center gap-1.5 text-[10px] font-mono transition-colors"
            style={{ color: '#374151' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#6b7280'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#374151'; }}>
            Developer Tools
            {devOpen ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
          </button>
        </div>
        {devOpen && (
          <div className="max-w-screen-xl mx-auto mt-6 space-y-5">
            <ConnectionMap />
            <MetaLiveFeed />
          </div>
        )}
      </footer>

      {/* ── Panels ──────────────────────────────────────────────────────────── */}
      <SettingsPanel isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} metaUrl={metaUrl} />
      <ChatPanel isOpen={chatOpen} onClose={() => setChatOpen(false)} dashboardContext={dashboardContext} />
      <AnalystChatPanel isOpen={analystChatOpen} onClose={() => setAnalystChatOpen(false)} />
      <OrchestratorChatPanel isOpen={orchestratorOpen} onClose={() => setOrchestratorOpen(false)} />

      <NewCampaignConversation
        isOpen={campaignPanelOpen}
        onClose={() => setCampaignPanelOpen(false)}
      />

      {(settingsOpen || chatOpen || analystChatOpen || orchestratorOpen) && (
        <div className="fixed inset-0 z-30" style={{ background: 'rgba(0,0,0,0.3)' }}
          onClick={() => { setSettingsOpen(false); setChatOpen(false); setAnalystChatOpen(false); setOrchestratorOpen(false); }} />
      )}
    </div>
  );
};

// ─── Dashboard ─────────────────────────────────────────────────────────────────

const Dashboard: React.FC = () => (
  <ToastProvider>
    <AgentProvider>
      <DashboardInner />
    </AgentProvider>
  </ToastProvider>
);

export default Dashboard;
