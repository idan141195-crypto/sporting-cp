import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Settings, ExternalLink, TrendingUp,
  Activity, ChevronDown, ChevronUp,
  X, Sparkles, ArrowLeft, LogOut,
} from 'lucide-react';
import { AgentProvider, useAgentBus } from '../agents/AgentContext';
import type { AgentMessage } from '../agents/types';
import { NewCampaignConversation } from '../components/NewCampaignConversation';
import { BrandingSettings } from '../components/BrandingSettings';
import { ConnectionMap } from '../components/ConnectionMap';
import { MetaLiveFeed } from '../components/MetaLiveFeed';
import { AICreativeSuite } from '../components/AICreativeSuite';
import { ToastProvider } from '../components/Toast';
import { useBrand } from '../lib/BrandingService';


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
    <section style={{ padding: '8px 0 24px' }}>

      {/* Hero header */}
      <div style={{ textAlign: 'center', marginBottom: 36 }}>
        <p style={{ color: '#6b7280', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 10 }}>
          AI Marketing Intelligence
        </p>
        <h1 style={{
          color: '#fff', fontSize: 30, fontWeight: 900, letterSpacing: '-0.025em',
          lineHeight: 1.12, fontFamily: 'var(--font-display)', margin: '0 0 12px',
        }}>
          Your AI Marketing Command Center
        </h1>
        <p style={{ color: '#6b7280', fontSize: 13, maxWidth: 440, margin: '0 auto', lineHeight: 1.6 }}>
          Three specialized agents working in perfect sync to scale your revenue and eliminate waste.
        </p>
      </div>

      {/* Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18 }}>
        {AGENT_CARDS.map((card, i) => {
          const { Icon, name, accent, tagline, description, capabilities } = card;
          const isHov = hovered === i;
          return (
            <div
              key={card.id}
              onClick={() => onOpen(card.id)}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              style={{
                position:      'relative',
                overflow:      'hidden',
                borderRadius:  16,
                padding:       '30px 26px 26px',
                cursor:        'pointer',
                minHeight:     340,
                display:       'flex',
                flexDirection: 'column',
                background:    `linear-gradient(145deg, color-mix(in srgb, ${accent} 10%, #111827) 0%, color-mix(in srgb, ${accent} 4%, #0d1117) 100%)`,
                border:        `1px solid color-mix(in srgb, ${accent} ${isHov ? '45' : '18'}%, transparent)`,
                boxShadow:     isHov
                  ? `0 0 0 1px color-mix(in srgb, ${accent} 18%, transparent), 0 16px 48px color-mix(in srgb, ${accent} 18%, rgba(0,0,0,0.6))`
                  : '0 2px 12px rgba(0,0,0,0.35)',
                transform:   isHov ? 'translateY(-5px)' : 'translateY(0)',
                transition:  'transform 0.28s ease, box-shadow 0.28s ease, border-color 0.28s ease',
              }}
            >
              {/* Top accent bar */}
              <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, height: 3,
                background: `linear-gradient(90deg, ${accent} 0%, transparent 70%)`,
                opacity: isHov ? 1 : 0.45,
                transition: 'opacity 0.28s',
              }} />

              {/* Watermark icon */}
              <div style={{
                position: 'absolute', bottom: -16, right: -16,
                opacity: isHov ? 0.1 : 0.04,
                transition: 'opacity 0.28s',
                pointerEvents: 'none',
              }}>
                <Icon size={128} color={accent} />
              </div>

              {/* Agent number badge */}
              <div style={{
                position: 'absolute', top: 22, right: 22,
                width: 24, height: 24, borderRadius: '50%',
                background: `color-mix(in srgb, ${accent} 12%, transparent)`,
                border: `1px solid color-mix(in srgb, ${accent} 28%, transparent)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, fontWeight: 900, color: accent, fontFamily: 'monospace',
              }}>
                0{i + 1}
              </div>

              {/* Icon box */}
              <div style={{
                width: 54, height: 54, borderRadius: 14, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: `color-mix(in srgb, ${accent} 14%, transparent)`,
                border: `1px solid color-mix(in srgb, ${accent} 28%, transparent)`,
                marginBottom: 18,
                boxShadow: isHov ? `0 0 20px color-mix(in srgb, ${accent} 22%, transparent)` : 'none',
                transition: 'box-shadow 0.28s',
              }}>
                <Icon size={24} color={accent} />
              </div>

              {/* Name + tagline pill */}
              <div style={{ marginBottom: 14 }}>
                <div style={{
                  color: '#fff', fontWeight: 900, fontSize: 20, lineHeight: 1.1,
                  marginBottom: 8, fontFamily: 'var(--font-display)',
                }}>
                  {name}
                </div>
                <div style={{
                  display: 'inline-flex', alignItems: 'center',
                  background: `color-mix(in srgb, ${accent} 10%, transparent)`,
                  border: `1px solid color-mix(in srgb, ${accent} 24%, transparent)`,
                  borderRadius: 20, padding: '3px 11px',
                }}>
                  <span style={{ color: accent, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                    {tagline}
                  </span>
                </div>
              </div>

              {/* Description */}
              <p style={{ color: '#9ca3af', fontSize: 12.5, lineHeight: 1.7, marginBottom: 18, flex: 1 }}>
                {description}
              </p>

              {/* Capabilities */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 22 }}>
                {capabilities.map(c => (
                  <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <div style={{
                      width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                      background: `color-mix(in srgb, ${accent} 10%, transparent)`,
                      border: `1px solid color-mix(in srgb, ${accent} 24%, transparent)`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <div style={{ width: 5, height: 5, borderRadius: '50%', background: accent }} />
                    </div>
                    <span style={{ color: '#9ca3af', fontSize: 11.5 }}>{c}</span>
                  </div>
                ))}
              </div>

              {/* CTA button */}
              <button style={{
                width: '100%', padding: '12px 18px', borderRadius: 10,
                border: `1px solid color-mix(in srgb, ${accent} ${isHov ? '70' : '35'}%, transparent)`,
                background: isHov ? accent : `color-mix(in srgb, ${accent} 18%, transparent)`,
                color: isHov ? '#0d0d0d' : 'rgba(255,255,255,0.9)',
                fontSize: 12, fontWeight: 800,
                textTransform: 'uppercase', letterSpacing: '0.08em',
                cursor: 'pointer',
                transition: 'background 0.28s, color 0.28s, border-color 0.28s',
                fontFamily: 'inherit',
              }}>
                Open {name} →
              </button>
            </div>
          );
        })}
      </div>

      {/* Dots */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 18 }}>
        {AGENT_CARDS.map((card, i) => (
          <div key={i} style={{
            width: hovered === i ? 22 : 6, height: 6, borderRadius: 3,
            background: hovered === i ? card.accent : 'rgba(255,255,255,0.1)',
            transition: 'all 0.25s',
          }} />
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

const SettingsPanel: React.FC<{ isOpen: boolean; onClose: () => void; metaUrl: string; onLogout: () => void }> = ({ isOpen, onClose, metaUrl, onLogout }) => (
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
    <div className="mt-8 pt-6 border-t" style={{ borderColor: 'var(--brand-muted)' }}>
      <button
        onClick={onLogout}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg transition-colors text-xs font-bold uppercase tracking-widest"
        style={{ border: '1px solid rgba(239,68,68,0.25)', color: '#ef4444', background: 'rgba(239,68,68,0.04)' }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.1)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(239,68,68,0.45)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.04)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(239,68,68,0.25)'; }}
      >
        <LogOut size={13} /> Disconnect &amp; Restart Setup
      </button>
    </div>
  </SidePanel>
);

// ─── Page types ────────────────────────────────────────────────────────────────

type PageId = 'home' | 'analyst' | 'campaigner' | 'creative';


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

// ─── Page shell (shared wrapper) ──────────────────────────────────────────────

const PageShell: React.FC<{
  accent: string;
  icon: React.ReactNode;
  title: string;
  tagline: string;
  onBack: () => void;
  children: React.ReactNode;
}> = ({ accent, icon, title, tagline, onBack, children }) => (
  <div>
    <div style={{
      display: 'flex', alignItems: 'center', gap: 16,
      padding: '20px 0 18px', marginBottom: 8,
      borderBottom: '1px solid var(--brand-muted)',
    }}>
      <button
        onClick={onBack}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '7px 14px', borderRadius: 8,
          border: '1px solid var(--brand-muted)',
          background: 'transparent', color: '#9ca3af',
          fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: '0.08em', cursor: 'pointer',
          transition: 'color 0.2s, border-color 0.2s',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#fff'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.25)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#9ca3af'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--brand-muted)'; }}
      >
        <ArrowLeft size={12} /> Back
      </button>
      <div style={{
        width: 42, height: 42, borderRadius: 12, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: `color-mix(in srgb, ${accent} 14%, transparent)`,
        border: `1px solid color-mix(in srgb, ${accent} 30%, transparent)`,
      }}>
        {icon}
      </div>
      <div>
        <div style={{ color: '#fff', fontWeight: 900, fontSize: 20, fontFamily: 'var(--font-display)', lineHeight: 1.1 }}>
          {title}
        </div>
        <div style={{ color: '#6b7280', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 3 }}>
          {tagline}
        </div>
      </div>
    </div>
    <div style={{ paddingTop: 24 }}>{children}</div>
  </div>
);

// ─── Analyst page ──────────────────────────────────────────────────────────────

const AnalystPage: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const { state, dispatch } = useAgentBus();
  const conv      = state.conversations.analyst;
  const isRunning = conv.status === 'THINKING' || conv.status === 'WORKING';
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const ACCENT = '#06b6d4';

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conv.messages]);

  const send = async () => {
    const msg = input.trim();
    if (!msg || isRunning) return;
    setInput('');
    await dispatch({ from: 'user', to: 'analyst', content: msg });
  };

  const messages = conv.messages.filter((m: AgentMessage) => m.from === 'user' || m.from === 'analyst');

  return (
    <PageShell
      accent={ACCENT}
      icon={<Activity size={20} color={ACCENT} />}
      title="Analyst"
      tagline="Campaign Intelligence"
      onBack={onBack}
    >
      <div style={{
        background: 'rgba(0,0,0,0.2)',
        border: '1px solid var(--brand-muted)',
        borderRadius: 16,
        display: 'flex', flexDirection: 'column',
        height: 'calc(100vh - 280px)',
        minHeight: 420,
      }}>
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {messages.length === 0 && !isRunning && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 12, textAlign: 'center' }}>
              <div style={{
                width: 56, height: 56, borderRadius: 16,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: `${ACCENT}18`, border: `1px solid ${ACCENT}40`,
              }}>
                <Activity size={26} color={ACCENT} />
              </div>
              <p style={{ color: '#9ca3af', fontSize: 13, lineHeight: 1.65, maxWidth: 340 }}>
                Ask the Analyst about your campaigns — ROAS, spend efficiency, creative fatigue, or scaling opportunities.
              </p>
            </div>
          )}
          {messages.map(m => {
            const isUser = m.from === 'user';
            return (
              <div key={m.id} style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '75%', padding: '12px 16px',
                  borderRadius: isUser ? '14px 14px 2px 14px' : '14px 14px 14px 2px',
                  background: isUser ? `${ACCENT}22` : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${isUser ? `${ACCENT}40` : 'rgba(255,255,255,0.07)'}`,
                  fontSize: 13.5, lineHeight: 1.65, color: isUser ? '#e2e8f0' : '#d1d5db',
                  whiteSpace: 'pre-wrap',
                }}>
                  {m.content}
                </div>
              </div>
            );
          })}
          {isRunning && (
            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <div style={{ padding: '12px 16px', borderRadius: '14px 14px 14px 2px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <div style={{ display: 'flex', gap: 4 }}>
                  {[0, 150, 300].map(d => (
                    <span key={d} style={{ width: 6, height: 6, borderRadius: '50%', background: ACCENT, display: 'inline-block', animation: `pulse 1.4s ease-in-out ${d}ms infinite` }} />
                  ))}
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
        <div style={{ borderTop: '1px solid var(--brand-muted)', padding: '14px 16px', display: 'flex', gap: 8, flexShrink: 0 }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Ask the analyst anything…"
            disabled={isRunning}
            style={{
              flex: 1, background: 'rgba(0,0,0,0.3)',
              border: '1px solid var(--brand-muted)', borderRadius: 10,
              color: '#fff', fontSize: 13.5, padding: '11px 16px',
              outline: 'none', fontFamily: 'inherit',
              opacity: isRunning ? 0.5 : 1,
            }}
          />
          <button
            onClick={send}
            disabled={!input.trim() || isRunning}
            style={{
              padding: '11px 22px', borderRadius: 10, border: 'none',
              background: input.trim() && !isRunning ? ACCENT : `${ACCENT}22`,
              color: input.trim() && !isRunning ? '#000' : '#374151',
              fontSize: 12, fontWeight: 700, cursor: input.trim() && !isRunning ? 'pointer' : 'not-allowed',
            }}
          >
            Send
          </button>
        </div>
      </div>
    </PageShell>
  );
};

// ─── Campaigner page ───────────────────────────────────────────────────────────

const CampaignerPage: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [panelOpen, setPanelOpen] = useState(true);
  const ACCENT = 'var(--brand-primary)';

  return (
    <>
      <PageShell
        accent={ACCENT}
        icon={<TrendingUp size={20} color={ACCENT} />}
        title="Campaigner"
        tagline="AI Ad Builder"
        onBack={onBack}
      >
        <div style={{
          background: 'rgba(0,0,0,0.2)',
          border: '1px solid var(--brand-muted)', borderRadius: 16,
          padding: '32px 36px',
          transition: 'margin-right 0.3s',
          marginRight: panelOpen ? 510 : 0,
        }}>
          <h2 style={{ color: '#fff', fontWeight: 900, fontSize: 22, fontFamily: 'var(--font-display)', marginBottom: 14 }}>
            AI Campaign Builder
          </h2>
          <p style={{ color: '#9ca3af', fontSize: 13.5, lineHeight: 1.75, marginBottom: 28 }}>
            Launch full Meta campaigns through natural conversation. Describe your audience and objective — the agent handles structure, targeting, and budgets via the live Meta Ads API.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 32 }}>
            {[
              { label: 'Natural language setup', desc: 'Tell the agent your product, audience, and goal in plain language' },
              { label: 'Live Meta API connection', desc: 'Campaigns created in real-time directly in your ad account' },
              { label: 'Budget & ad set management', desc: 'Automatic campaign structure, targeting, and daily budget configuration' },
            ].map(({ label, desc }) => (
              <div key={label} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: ACCENT, marginTop: 6, flexShrink: 0 }} />
                <div>
                  <div style={{ color: '#e2e8f0', fontSize: 13.5, fontWeight: 700 }}>{label}</div>
                  <div style={{ color: '#6b7280', fontSize: 12.5, marginTop: 3, lineHeight: 1.5 }}>{desc}</div>
                </div>
              </div>
            ))}
          </div>
          {!panelOpen && (
            <button
              onClick={() => setPanelOpen(true)}
              style={{
                padding: '12px 28px', borderRadius: 10,
                border: `1px solid color-mix(in srgb, ${ACCENT} 40%, transparent)`,
                background: `color-mix(in srgb, ${ACCENT} 15%, transparent)`,
                color: '#fff', fontSize: 12, fontWeight: 800,
                textTransform: 'uppercase', letterSpacing: '0.08em', cursor: 'pointer',
              }}
            >
              Open Campaign Builder →
            </button>
          )}
        </div>
      </PageShell>
      <NewCampaignConversation isOpen={panelOpen} onClose={() => setPanelOpen(false)} />
    </>
  );
};

// ─── Creative page ─────────────────────────────────────────────────────────────

const CreativePage: React.FC<{ onBack: () => void }> = ({ onBack }) => (
  <PageShell
    accent="#a78bfa"
    icon={<Sparkles size={20} color="#a78bfa" />}
    title="AI Creative Studio"
    tagline="Image · Video · Copy"
    onBack={onBack}
  >
    <AICreativeSuite />
  </PageShell>
);

// ─── Inner dashboard (needs ToastProvider) ─────────────────────────────────────

const DashboardInner: React.FC<{ onLogout?: () => void }> = ({ onLogout = () => {} }) => {
  const brand = useBrand();

  const [settingsOpen,     setSettingsOpen]     = useState(false);
  const [orchestratorOpen, setOrchestratorOpen] = useState(false);
  const [devOpen,          setDevOpen]          = useState(false);
  const [currentPage,      setCurrentPage]      = useState<PageId>('home');

  const [statusData, setStatusData] = useState<StatusResponse | null>(null);
  const [isLive,     setIsLive]     = useState(false);
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
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const iv = setInterval(fetchStatus, POLL_MS);
    return () => clearInterval(iv);
  }, [fetchStatus]);

  const accountNum = (statusData?.accountId ?? '').replace('act_', '');
  const metaUrl    = accountNum
    ? `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${accountNum}`
    : 'https://adsmanager.facebook.com';

  const navBtn: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '6px 14px', borderRadius: 'var(--radius-size)',
    border: '1px solid var(--brand-muted)',
    color: '#9ca3af', fontSize: 11, fontWeight: 700,
    textTransform: 'uppercase', letterSpacing: '0.08em',
    cursor: 'pointer', background: 'transparent',
    transition: 'color 0.2s, border-color 0.2s',
  };

  const pageActive = (color: string): React.CSSProperties => ({
    color, borderColor: `color-mix(in srgb, ${color} 40%, transparent)`,
  });

  return (
    <div className="min-h-screen" style={{ background: 'var(--brand-surface)' }}>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-30 flex items-center justify-between border-b"
        style={{
          background: 'var(--brand-surface-card)',
          borderColor: 'var(--brand-muted)',
          padding: '0 48px',
          height: 64,
        }}
      >
        {/* Logo — click → home */}
        <button
          onClick={() => setCurrentPage('home')}
          className="flex items-center gap-3"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          <img
            src={brand.logoUrl} alt={brand.name}
            className="w-8 h-8 rounded object-contain"
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
        </button>

        <nav className="flex items-center gap-2">
          {/* Chief Agent */}
          <button
            onClick={() => { setOrchestratorOpen(o => !o); setSettingsOpen(false); }}
            style={{ ...navBtn, ...(orchestratorOpen ? pageActive('#a78bfa') : {}) }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#a78bfa'; (e.currentTarget as HTMLElement).style.borderColor = 'color-mix(in srgb,#a78bfa 40%,transparent)'; }}
            onMouseLeave={e => { if (!orchestratorOpen) { (e.currentTarget as HTMLElement).style.color = '#9ca3af'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--brand-muted)'; } }}>
            <Sparkles size={12} /> Chief Agent
          </button>
          {/* Analyst */}
          <button
            onClick={() => { setCurrentPage('analyst'); setOrchestratorOpen(false); setSettingsOpen(false); }}
            style={{ ...navBtn, ...(currentPage === 'analyst' ? pageActive('#06b6d4') : {}) }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#06b6d4'; (e.currentTarget as HTMLElement).style.borderColor = 'color-mix(in srgb,#06b6d4 40%,transparent)'; }}
            onMouseLeave={e => { if (currentPage !== 'analyst') { (e.currentTarget as HTMLElement).style.color = '#9ca3af'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--brand-muted)'; } }}>
            <Activity size={12} /> Analyst
          </button>
          {/* Campaigner */}
          <button
            onClick={() => { setCurrentPage('campaigner'); setOrchestratorOpen(false); setSettingsOpen(false); }}
            style={{ ...navBtn, ...(currentPage === 'campaigner' ? pageActive('var(--brand-primary)') : {}) }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--brand-primary)'; (e.currentTarget as HTMLElement).style.borderColor = 'color-mix(in srgb,var(--brand-primary) 40%,transparent)'; }}
            onMouseLeave={e => { if (currentPage !== 'campaigner') { (e.currentTarget as HTMLElement).style.color = '#9ca3af'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--brand-muted)'; } }}>
            <TrendingUp size={12} /> Campaigner
          </button>
          {/* AI Creative */}
          <button
            onClick={() => { setCurrentPage('creative'); setOrchestratorOpen(false); setSettingsOpen(false); }}
            style={{ ...navBtn, ...(currentPage === 'creative' ? pageActive('#a78bfa') : {}) }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#a78bfa'; (e.currentTarget as HTMLElement).style.borderColor = 'color-mix(in srgb,#a78bfa 40%,transparent)'; }}
            onMouseLeave={e => { if (currentPage !== 'creative') { (e.currentTarget as HTMLElement).style.color = '#9ca3af'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--brand-muted)'; } }}>
            <Sparkles size={12} /> AI Creative
          </button>
          {/* Settings */}
          <button
            onClick={() => { setSettingsOpen(o => !o); setOrchestratorOpen(false); }}
            style={{ ...navBtn, ...(settingsOpen ? pageActive('var(--brand-primary)') : {}) }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--brand-primary)'; (e.currentTarget as HTMLElement).style.borderColor = 'color-mix(in srgb,var(--brand-primary) 40%,transparent)'; }}
            onMouseLeave={e => { if (!settingsOpen) { (e.currentTarget as HTMLElement).style.color = '#9ca3af'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--brand-muted)'; } }}>
            <Settings size={12} /> Settings
          </button>
        </nav>
      </header>

      {/* ── Main ────────────────────────────────────────────────────────────── */}
      <main
        className="max-w-screen-xl mx-auto px-6 py-8 transition-all duration-300"
        style={(settingsOpen || orchestratorOpen) ? { marginRight: 560 } : {}}
      >
        {currentPage === 'home'       && <AgentCarousel onOpen={id => setCurrentPage(id)} />}
        {currentPage === 'analyst'    && <AnalystPage    onBack={() => setCurrentPage('home')} />}
        {currentPage === 'campaigner' && <CampaignerPage onBack={() => setCurrentPage('home')} />}
        {currentPage === 'creative'   && <CreativePage   onBack={() => setCurrentPage('home')} />}
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

      {/* ── Side panels ─────────────────────────────────────────────────────── */}
      <SettingsPanel isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} metaUrl={metaUrl} onLogout={onLogout} />
      <OrchestratorChatPanel isOpen={orchestratorOpen} onClose={() => setOrchestratorOpen(false)} />
      {(settingsOpen || orchestratorOpen) && (
        <div className="fixed inset-0 z-30" style={{ background: 'rgba(0,0,0,0.3)' }}
          onClick={() => { setSettingsOpen(false); setOrchestratorOpen(false); }} />
      )}
    </div>
  );
};

// ─── Dashboard ─────────────────────────────────────────────────────────────────

const Dashboard: React.FC<{ onLogout?: () => void }> = ({ onLogout }) => (
  <ToastProvider>
    <AgentProvider>
      <DashboardInner onLogout={onLogout} />
    </AgentProvider>
  </ToastProvider>
);

export default Dashboard;
