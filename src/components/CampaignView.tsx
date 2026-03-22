import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BridgeCoachPanel } from './BridgeCoachPanel';
import { useToast } from './Toast';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DropOff { cart: 'HIGH' | 'LOW'; checkout: 'HIGH' | 'LOW'; }

interface ActiveSafetyPause {
  name:                   string;
  reason:                 string;
  pausedAt:               string;
  estimatedWasteSavedUsd: number;
}

export interface CampaignPair {
  productId:          number;
  productName:        string;
  category:           string;
  adSetId:            string;
  adSetName:          string;
  adSetStatus:        string;
  dailyBudgetUsd:     number | null;
  roas:               number | null;
  spend:              number | null;
  inventory:          number | null;
  siteHealth:         string;
  dropOff:            DropOff;
  liveDecision:       'SCALE' | 'PAUSE' | 'HOLD';
  liveDecisionReason: string;
  lastAction:         string | null;
  lastActionAt:       string | null;
  lastActionAgo:      string | null;
  lastActionReason:   string | null;
  mockProductKey?:    string;
  salesVelocity?:     number | null;
  etsHours?:          number | null;
  stockoutWarning?:   boolean;
  // Meta Ads Manager live metrics
  impressions?:        number | null;
  reach?:              number | null;
  results?:            number | null;      // purchases / conversions
  costPerResult?:      number | null;      // CPA
  ctr?:                number | null;      // click-through rate %
  cpm?:                number | null;      // cost per 1,000 impressions
  frequency?:          number | null;
  campaignObjective?:  string | null;      // PURCHASES | TRAFFIC | AWARENESS
  campaignName?:       string | null;
}

interface StatusResponse {
  lastUpdated:          string;
  lastRunAt:            string | null;
  runCount:             number;
  accountId:            string;
  siteHealth:           string;
  bugPage:              string | null;
  pairs:                CampaignPair[];
  totalWasteSavedUsd?:  number;
  activeSafetyPauses?:  ActiveSafetyPause[];
  globalDailyMaxUsd?:   number;
  totalBudgetUsd?:      number;
}

// ─── Mock data — shown when backend is offline ────────────────────────────────

const MOCK_PAIRS: CampaignPair[] = [
  {
    productId: 101, productName: 'Budo Pro Gloves',    category: 'Combat Equipment',
    adSetId: '23850001', adSetName: 'Budo – Sports Gear Retargeting',
    adSetStatus: 'ACTIVE', dailyBudgetUsd: 50.00,
    roas: 6.2,  spend: 23.50, inventory: 42,
    siteHealth: 'OK', dropOff: { cart: 'LOW', checkout: 'LOW' },
    liveDecision: 'SCALE', liveDecisionReason: 'ROAS 6.20 > 5.0 AND inventory 42 > 10 → +15% budget',
    lastAction: 'SCALE', lastActionAt: null, lastActionAgo: '8m ago',
    lastActionReason: 'ROAS 6.20 > 5.0 AND inventory 42 > 10',
  },
  {
    productId: 102, productName: 'Budo Summer Training Gi', category: 'Apparel',
    adSetId: '23850002', adSetName: 'Budo – Summer Collection Prospecting',
    adSetStatus: 'ACTIVE', dailyBudgetUsd: 35.00,
    roas: 4.1, spend: 18.00, inventory: 8,
    siteHealth: 'OK', dropOff: { cart: 'LOW', checkout: 'LOW' },
    liveDecision: 'HOLD', liveDecisionReason: 'ROAS 4.10 in optimize range (3.0–5.0)',
    lastAction: 'HOLD', lastActionAt: null, lastActionAgo: '23m ago',
    lastActionReason: 'ROAS 4.10 in optimize range',
  },
  {
    productId: 103, productName: 'Budo Elite Foot Protectors', category: 'Premium Gear',
    adSetId: '23850003', adSetName: 'Budo – Premium Products Retargeting',
    adSetStatus: 'PAUSED', dailyBudgetUsd: 60.00,
    roas: 1.8, spend: 41.00, inventory: 1,
    siteHealth: 'OK', dropOff: { cart: 'HIGH', checkout: 'LOW' },
    liveDecision: 'PAUSE', liveDecisionReason: 'Critical inventory: 1 units < 2 (pause threshold)',
    lastAction: 'PAUSE', lastActionAt: null, lastActionAgo: '2m ago',
    lastActionReason: 'Critical inventory: 1 units < 2 (pause threshold)',
  },
  {
    productId: 104, productName: 'Budo Sparring Accessories Pack', category: 'Accessories',
    adSetId: '23850004', adSetName: 'Budo – Accessories Bundle',
    adSetStatus: 'ACTIVE', dailyBudgetUsd: 28.00,
    roas: 5.9, spend: 12.00, inventory: 65,
    siteHealth: 'OK', dropOff: { cart: 'LOW', checkout: 'HIGH' },
    liveDecision: 'HOLD', liveDecisionReason: 'ROAS 5.90 qualifies for scale but HIGH drop-off at cart/checkout',
    lastAction: 'HOLD', lastActionAt: null, lastActionAgo: '8m ago',
    lastActionReason: 'High drop-off at checkout',
  },
  {
    productId: 105, productName: 'Budo Kids Starter Set', category: 'Kids',
    adSetId: '23850005', adSetName: 'Budo – Kids Collection',
    adSetStatus: 'ACTIVE', dailyBudgetUsd: 20.00,
    roas: 7.1, spend: 8.50, inventory: 84,
    siteHealth: 'OK', dropOff: { cart: 'LOW', checkout: 'LOW' },
    liveDecision: 'SCALE', liveDecisionReason: 'ROAS 7.10 > 5.0 AND inventory 84 > 10 → +15% budget',
    lastAction: null, lastActionAt: null, lastActionAgo: null,
    lastActionReason: null,
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeSince(isoStr: string): string {
  const ms = Date.now() - new Date(isoStr).getTime();
  const m  = Math.floor(ms / 60_000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m ago`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

// Hero KPI card with glassmorphism
interface HeroKpiProps {
  label:    string;
  value:    string;
  sub?:     string;
  accent:   'cyan' | 'amber' | 'emerald' | 'red';
  pulse?:   boolean;
  children?: React.ReactNode;
}

const ACCENT_MAP = {
  cyan:    { border: 'border-neon-cyan/25',       text: 'text-neon-cyan',      dot: 'bg-neon-cyan',      dotAnim: 'animate-pulse-cyan' },
  amber:   { border: 'border-cyber-amber/25',     text: 'text-cyber-amber',    dot: 'bg-cyber-amber',    dotAnim: 'animate-pulse-amber' },
  emerald: { border: 'border-profit-emerald/25',  text: 'text-profit-emerald', dot: 'bg-profit-emerald', dotAnim: 'animate-pulse' },
  red:     { border: 'border-danger-red/25',      text: 'text-danger-red',     dot: 'bg-danger-red',     dotAnim: 'animate-pulse-red' },
};

const HeroKpiCard: React.FC<HeroKpiProps> = ({ label, value, sub, accent, pulse, children }) => {
  const a = ACCENT_MAP[accent];
  return (
    <div className={`relative rounded-2xl border ${a.border} p-4 flex flex-col gap-1.5 shadow-glass transition-all duration-300`}
      style={{ background: 'rgba(16,21,32,0.85)', backdropFilter: 'blur(8px)' }}>
      {pulse && (
        <span className={`absolute top-3 right-3 w-2 h-2 rounded-full ${a.dot} ${a.dotAnim}`} />
      )}
      <p className="text-text-secondary text-[10px] font-mono uppercase tracking-widest">{label}</p>
      <p className={`font-display font-black text-3xl tracking-tight ${a.text}`}>{value}</p>
      {sub && <p className="text-text-secondary text-[11px]">{sub}</p>}
      {children}
    </div>
  );
};

// Glowing pulse status dot
const StatusDot: React.FC<{ decision: string; reason?: string }> = ({ decision, reason }) => {
  const isLearning = decision === 'HOLD' && (reason?.toLowerCase().includes('learning') ?? false);
  if (decision === 'SCALE')    return <span className="w-2 h-2 rounded-full bg-neon-cyan animate-pulse-cyan shrink-0" />;
  if (decision === 'PAUSE')    return <span className="w-2 h-2 rounded-full bg-danger-red animate-pulse shrink-0" />;
  if (isLearning)              return <span className="w-2 h-2 rounded-full bg-learning-blue animate-pulse shrink-0" />;
  return                              <span className="w-2 h-2 rounded-full bg-muted-gray shrink-0" />;
};

// Decision badge
const DecisionBadge: React.FC<{ decision: string; reason?: string }> = ({ decision, reason }) => {
  const isLearning = decision === 'HOLD' && (reason?.toLowerCase().includes('learning') ?? false);

  const cfg: Record<string, { bg: string; text: string; label: string }> = {
    SCALE:    { bg: 'bg-neon-cyan/10 border border-neon-cyan/40',         text: 'text-neon-cyan',       label: '⚡ SCALE'    },
    PAUSE:    { bg: 'bg-danger-red/10 border border-danger-red/40',       text: 'text-danger-red',      label: '⏸ PAUSE'    },
    LEARNING: { bg: 'bg-learning-blue/10 border border-learning-blue/40', text: 'text-learning-blue',   label: '🧠 LEARNING' },
    HOLD:     { bg: 'bg-muted-gray/10 border border-obsidian-border',     text: 'text-text-secondary',  label: '— HOLD'      },
  };

  const key = isLearning ? 'LEARNING' : decision;
  const c   = cfg[key] ?? cfg.HOLD;

  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold font-mono uppercase tracking-widest ${c.bg} ${c.text}`}>
      <StatusDot decision={decision} reason={reason} />
      {c.label}
    </span>
  );
};

// Fuel gauge inventory bar
const InventoryBar: React.FC<{ qty: number | null; etsHours?: number | null }> = ({ qty, etsHours }) => {
  if (qty === null) return <span className="text-text-secondary text-xs font-mono">—</span>;

  const pct       = Math.min(100, (qty / 100) * 100);
  const textColor = qty < 2 ? 'text-danger-red' : qty < 10 ? 'text-cyber-amber' : 'text-profit-emerald';
  const barGrad   = pct > 60
    ? 'linear-gradient(90deg, #10B981, #06D6F0)'
    : pct > 20
    ? 'linear-gradient(90deg, #F59E0B, #10B981)'
    : 'linear-gradient(90deg, #be123c, #F59E0B)';

  const etsColor = etsHours != null
    ? (etsHours < 6 ? 'text-danger-red' : etsHours < 12 ? 'text-cyber-amber' : 'text-text-secondary')
    : '';
  const etsLabel = etsHours != null
    ? (etsHours < 1 ? `~${Math.round(etsHours * 60)}m` : `~${etsHours.toFixed(1)}h`)
    : null;

  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <div className="flex items-center gap-2 min-w-0">
        <span className={`text-xs font-mono font-bold tabular-nums ${textColor}`}>{qty}</span>
        <div className="flex-1 h-2 rounded-full overflow-hidden min-w-[48px]"
          style={{ background: 'rgba(26,32,48,0.8)' }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: barGrad }} />
        </div>
      </div>
      {etsLabel && (
        <span className={`text-[9px] font-mono font-bold ${etsColor}`}>⏱ {etsLabel}</span>
      )}
    </div>
  );
};

// ROAS cell
const RoasCell: React.FC<{ roas: number | null }> = ({ roas }) => {
  if (roas === null) return <span className="text-text-secondary text-xs font-mono">—</span>;
  const color = roas > 5 ? 'text-profit-emerald' : roas >= 3 ? 'text-white' : 'text-danger-red';
  return <span className={`text-xs font-mono font-bold tabular-nums ${color}`}>{roas.toFixed(2)}x</span>;
};

// ─── Row Action Bar (Pause / Scale / Resume + View in Meta) ──────────────────

const API_BASE = 'http://localhost:3001';

const RowActionBar: React.FC<{
  pair:      CampaignPair;
  accountId: string;
  isLive:    boolean;
  onRefresh: () => void;
}> = ({ pair, accountId, isLive, onRefresh }) => {
  const toast    = useToast();
  const [busy, setBusy] = useState(false);

  const accountNum = accountId.replace('act_', '');
  const metaUrl    = `https://adsmanager.facebook.com/adsmanager/manage/adsets?act=${accountNum}&filter_set=HAS_ID_${pair.adSetId}`;

  const applyAction = async (type: 'pause' | 'resume' | 'scale_budget', factor?: number) => {
    if (!isLive) {
      toast({ variant: 'info', title: 'Demo Mode', body: 'Start the backend to apply real actions.' });
      return;
    }
    setBusy(true);
    try {
      const res  = await fetch(`${API_BASE}/api/action`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ type, adSetId: pair.adSetId, adSetName: pair.adSetName, factor }),
      });
      const json = await res.json();
      if (json.success) {
        toast({ variant: 'meta', title: 'Confirmed by Meta', body: json.message });
        onRefresh();
      } else {
        toast({ variant: 'error', title: 'Action Failed', body: json.error ?? 'Unknown error' });
      }
    } catch {
      toast({ variant: 'error', title: 'Backend Unreachable', body: 'Make sure the API server is running on port 3001.' });
    } finally {
      setBusy(false);
    }
  };

  const isActive = pair.adSetStatus === 'ACTIVE';

  return (
    <div className="flex items-center gap-2 flex-wrap mt-2 pt-2 border-t border-obsidian-border">
      <p className="text-text-secondary text-[10px] font-mono uppercase tracking-widest mr-1">Quick Actions:</p>

      {isActive ? (
        <>
          <button
            onClick={() => applyAction('pause')}
            disabled={busy}
            className="text-[10px] font-mono font-bold px-2.5 py-1.5 rounded-lg border border-danger-red/30 text-danger-red hover:bg-danger-red/10 transition-all disabled:opacity-40"
          >
            {busy ? '…' : '🚨 Emergency Pause'}
          </button>
          <button
            onClick={() => applyAction('scale_budget', 1.10)}
            disabled={busy}
            className="text-[10px] font-mono font-bold px-2.5 py-1.5 rounded-lg border border-neon-cyan/30 text-neon-cyan hover:bg-neon-cyan/10 transition-all disabled:opacity-40"
          >
            {busy ? '…' : '⚡ Scale +10%'}
          </button>
          <button
            onClick={() => applyAction('scale_budget', 1.15)}
            disabled={busy}
            className="text-[10px] font-mono font-bold px-2.5 py-1.5 rounded-lg border border-neon-cyan/20 text-neon-cyan/70 hover:bg-neon-cyan/5 transition-all disabled:opacity-40"
          >
            {busy ? '…' : '⚡ Scale +15%'}
          </button>
        </>
      ) : (
        <button
          onClick={() => applyAction('resume')}
          disabled={busy}
          className="text-[10px] font-mono font-bold px-2.5 py-1.5 rounded-lg border border-profit-emerald/30 text-profit-emerald hover:bg-profit-emerald/10 transition-all disabled:opacity-40"
        >
          {busy ? '…' : '▶ Resume'}
        </button>
      )}

      <a
        href={metaUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[10px] font-mono font-bold px-2.5 py-1.5 rounded-lg border border-obsidian-border text-text-secondary hover:text-neon-cyan hover:border-neon-cyan/30 transition-all inline-flex items-center gap-1"
        title="Open in Meta Ads Manager"
      >
        ↗ View in Meta
      </a>

      {!isLive && (
        <span className="text-text-secondary text-[10px] font-mono">(demo — backend offline)</span>
      )}
    </div>
  );
};

// ─── Action Log ───────────────────────────────────────────────────────────────

interface ActionLogEntry {
  timestamp:  string;
  action:     string;
  adSetName:  string;
  source:     'manual' | 'engine';
  message:    string;
  roas?:      number | null;
  budgetFrom?: number | null;
  budgetTo?:   number | null;
}

const ACTION_LOG_COLOR: Record<string, string> = {
  SCALE:  'text-neon-cyan',
  PAUSE:  'text-danger-red',
  RESUME: 'text-profit-emerald',
  HOLD:   'text-text-secondary',
  BLOCK:  'text-cyber-amber',
};

const ActionLog: React.FC = () => {
  const [entries, setEntries] = useState<ActionLogEntry[]>([]);

  const fetchLog = async () => {
    try {
      const res  = await fetch(`${API_BASE}/api/action-log`, { signal: AbortSignal.timeout(3000) });
      const json = await res.json();
      setEntries(json.entries ?? []);
    } catch { /* backend offline — keep existing entries */ }
  };

  useEffect(() => {
    fetchLog();
    const iv = setInterval(fetchLog, 15_000);
    return () => clearInterval(iv);
  }, []);

  if (entries.length === 0) return (
    <div className="rounded-2xl border border-obsidian-border px-4 py-3"
      style={{ background: 'rgba(10,13,20,0.9)' }}>
      <p className="text-text-secondary text-[10px] font-mono uppercase tracking-widest">Meta API — Action Log · No actions yet</p>
    </div>
  );

  return (
    <div className="rounded-2xl border border-obsidian-border overflow-hidden"
      style={{ background: 'rgba(10,13,20,0.9)' }}>

      <div className="flex items-center justify-between px-4 py-3 border-b border-obsidian-border"
        style={{ background: 'rgba(7,9,15,0.8)' }}>
        <h3 className="text-white font-bold text-xs uppercase tracking-widest flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-neon-cyan animate-pulse-cyan" />
          Meta API — Action Log
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-text-secondary text-[10px] font-mono">Last 5 responses</span>
          <button
            onClick={fetchLog}
            className="text-[10px] font-mono text-text-secondary hover:text-neon-cyan border border-obsidian-border hover:border-neon-cyan/30 px-2 py-1 rounded-lg transition-colors"
          >
            ↺
          </button>
        </div>
      </div>

      <div>
        {entries.map((e, i) => (
          <div
            key={`${e.timestamp}-${i}`}
            className="grid grid-cols-[52px_1fr_auto] items-start gap-3 px-4 py-2.5 border-b border-obsidian-border last:border-b-0 hover:bg-white/[0.02] transition-colors"
          >
            {/* Action badge */}
            <span className={`text-[10px] font-mono font-black uppercase pt-0.5 ${ACTION_LOG_COLOR[e.action] ?? 'text-text-secondary'}`}>
              {e.action}
            </span>

            {/* Message + ad set */}
            <div className="min-w-0">
              <p className="text-white text-xs leading-snug">{e.message}</p>
              <p className="text-text-secondary text-[10px] font-mono mt-0.5 truncate">
                {e.adSetName}
                {e.source === 'manual' && (
                  <span className="ml-1.5 px-1.5 py-px rounded bg-neon-cyan/10 text-neon-cyan border border-neon-cyan/20 text-[9px]">MANUAL</span>
                )}
              </p>
            </div>

            {/* Timestamp */}
            <span className="text-text-secondary text-[10px] font-mono shrink-0 pt-0.5">
              {new Date(e.timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const API_URL = 'http://localhost:3001/api/status';
const POLL_MS = 10_000;

export const CampaignView: React.FC = () => {
  const [data,       setData]       = useState<StatusResponse | null>(null);
  const [isLive,     setIsLive]     = useState(false);
  const [loading,    setLoading]    = useState(true);
  const [lastFetch,  setLastFetch]  = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const hasDataRef = useRef(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(API_URL, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: StatusResponse = await res.json();
      setData(json);
      setIsLive(true);
      hasDataRef.current = true;
    } catch {
      if (!hasDataRef.current) {
        setData({
          lastUpdated: new Date().toISOString(),
          lastRunAt: null, runCount: 0,
          accountId: 'act_DEMO', siteHealth: 'OK', bugPage: null,
          pairs: MOCK_PAIRS,
        });
        hasDataRef.current = true;
      }
      setIsLive(false);
    } finally {
      setLoading(false);
      setLastFetch(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const iv = setInterval(fetchStatus, POLL_MS);
    return () => clearInterval(iv);
  }, [fetchStatus]);

  const pairs = data?.pairs ?? MOCK_PAIRS;

  // ── Hero KPI computations ─────────────────────────────────────────────────
  const scaleCount  = pairs.filter(p => p.liveDecision === 'SCALE').length;
  const pauseCount  = pairs.filter(p => p.liveDecision === 'PAUSE').length;
  const holdCount   = pairs.filter(p => p.liveDecision === 'HOLD').length;

  const wasteSaved  = data?.totalWasteSavedUsd ?? 0;
  const activePauses = data?.activeSafetyPauses?.length ?? pauseCount;

  const roasPairs   = pairs.filter(p => p.roas !== null);
  const avgRoas     = roasPairs.length
    ? roasPairs.reduce((s, p) => s + p.roas!, 0) / roasPairs.length
    : 0;

  const totalBudget = data?.totalBudgetUsd
    ?? pairs.reduce((s, p) => s + (p.dailyBudgetUsd ?? 0), 0);
  const globalMax   = data?.globalDailyMaxUsd ?? 0;
  const budgetPct   = globalMax > 0 ? Math.min(100, (totalBudget / globalMax) * 100) : 0;
  const budgetColor = budgetPct > 80 ? 'bg-danger-red' : budgetPct > 60 ? 'bg-cyber-amber' : 'bg-profit-emerald';

  // Pause info lookup (for hover tooltips)
  const pauseMap = new Map<string, ActiveSafetyPause>(
    (data?.activeSafetyPauses ?? []).map(p => [p.name, p])
  );

  return (
    <div className="animate-slide-in space-y-5">

      {/* ── Command Center Header ─────────────────────────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-white font-display font-black uppercase tracking-widest text-base flex items-center gap-2">
            🔗 ScaleAI Command Center
          </h2>
          <p className="text-text-secondary text-xs mt-1">
            Budo products × Meta Ad Sets — automated budget control in real time
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Decision counters */}
          <div className="flex gap-3 text-[10px] font-mono">
            <span className="flex items-center gap-1.5 text-neon-cyan">
              <span className="w-1.5 h-1.5 rounded-full bg-neon-cyan animate-pulse-cyan" />
              {scaleCount} Scaling
            </span>
            <span className="flex items-center gap-1.5 text-text-secondary">
              <span className="w-1.5 h-1.5 rounded-full bg-muted-gray" />
              {holdCount} Hold
            </span>
            <span className="flex items-center gap-1.5 text-danger-red">
              <span className="w-1.5 h-1.5 rounded-full bg-danger-red animate-pulse" />
              {pauseCount} Paused
            </span>
          </div>

          {/* Live / Offline badge */}
          <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold font-mono uppercase tracking-widest border ${
            isLive
              ? 'bg-neon-cyan/10 border-neon-cyan/30 text-neon-cyan'
              : 'bg-muted-gray/10 border-obsidian-border text-text-secondary'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${isLive ? 'bg-neon-cyan animate-pulse-cyan' : 'bg-muted-gray'}`} />
            {isLive ? 'Live' : 'Demo'}
          </span>

          <button
            onClick={fetchStatus}
            className="text-[10px] font-mono text-text-secondary hover:text-white border border-obsidian-border hover:border-muted-gray px-2.5 py-1 rounded-lg transition-colors"
          >
            ↺ Refresh
          </button>
        </div>
      </div>

      {/* ── Hero KPI Row ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 animate-fade-in-up">

        <HeroKpiCard
          label="Waste Saved"
          value={`$${wasteSaved.toFixed(2)}`}
          sub="Prevented from wasted spend"
          accent="emerald"
          pulse
        />

        <HeroKpiCard
          label="Active Protection"
          value={String(activePauses)}
          sub={activePauses === 0 ? 'No safety pauses active' : `ad set${activePauses !== 1 ? 's' : ''} paused by engine`}
          accent={activePauses > 0 ? 'red' : 'cyan'}
          pulse={activePauses > 0}
        />

        <HeroKpiCard
          label="Avg Account ROAS"
          value={roasPairs.length ? `${avgRoas.toFixed(2)}x` : '—'}
          sub={avgRoas > 5 ? '⚡ Above scale threshold' : avgRoas > 3 ? '⚙️ Optimize range' : avgRoas > 0 ? '🔴 Below floor' : 'No data'}
          accent={avgRoas > 5 ? 'cyan' : avgRoas > 3 ? 'amber' : 'red'}
        />

        <HeroKpiCard
          label="Global Budget / Day"
          value={`$${totalBudget.toFixed(0)}`}
          sub={globalMax > 0 ? `of $${globalMax} cap` : 'No cap configured'}
          accent="amber"
        >
          {globalMax > 0 && (
            <div className="mt-1.5">
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(26,32,48,0.8)' }}>
                <div className={`h-full rounded-full transition-all ${budgetColor}`} style={{ width: `${budgetPct}%` }} />
              </div>
              <p className="text-[9px] font-mono text-text-secondary mt-0.5">{budgetPct.toFixed(0)}% utilized</p>
            </div>
          )}
        </HeroKpiCard>
      </div>

      {/* ── Panic / BUG_DETECTED banner ───────────────────────────────────── */}
      {data?.siteHealth === 'BUG_DETECTED' && (
        <div className="flex items-center gap-3 bg-danger-red/10 border border-danger-red/40 rounded-xl px-4 py-3 animate-fade-in-up">
          <span className="text-danger-red text-lg">🐛</span>
          <div>
            <p className="text-danger-red font-bold text-sm">PANIC MODE — BUG_DETECTED</p>
            <p className="text-danger-red/70 text-xs">
              Bug detected on /{data.bugPage} · All ad sets paused · Budgets rolled back to pre-scale values
            </p>
          </div>
        </div>
      )}

      {/* ── Stockout warning banner ───────────────────────────────────────── */}
      {pairs.some(p => p.stockoutWarning) && (
        <div className="flex items-center gap-3 bg-cyber-amber/10 border border-cyber-amber/40 rounded-xl px-4 py-3 animate-fade-in-up">
          <span className="text-cyber-amber text-lg">⏱</span>
          <div>
            <p className="text-cyber-amber font-bold text-sm">STOCKOUT RISK DETECTED</p>
            <p className="text-cyber-amber/70 text-xs">
              {pairs.filter(p => p.stockoutWarning).map(p => `"${p.productName}" (~${p.etsHours!.toFixed(1)}h)`).join(' · ')} · Scaling paused to extend inventory runway
            </p>
          </div>
        </div>
      )}

      {/* ── AI Coach Panel ────────────────────────────────────────────────── */}
      {!loading && (
        <BridgeCoachPanel
          pairs={pairs}
          siteHealth={data?.siteHealth ?? 'OK'}
          bugPage={data?.bugPage ?? null}
          isLive={isLive}
        />
      )}

      {/* ── Live Bridge Table ─────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex flex-col items-center justify-center h-48 gap-3">
          <span className="w-6 h-6 rounded-full border-2 border-neon-cyan/30 border-t-neon-cyan animate-spin" />
          <p className="text-text-secondary text-sm font-mono">Connecting to ScaleAI engine…</p>
        </div>
      ) : pairs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center border border-obsidian-border rounded-2xl"
          style={{ background: 'rgba(16,21,32,0.5)' }}>
          <p className="text-5xl mb-4">🔗</p>
          <p className="text-white font-bold text-base mb-2">No Campaigns Connected</p>
          <p className="text-text-secondary text-sm max-w-md">
            Start the ScaleAI meta-integration backend to connect Budo products to Meta Ad Sets.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl overflow-hidden border border-obsidian-border"
          style={{ background: 'rgba(10,13,20,0.9)' }}>

          {/* Table header */}
          <div className="grid grid-cols-[1fr_1fr_130px_100px_70px_80px_120px] gap-0 border-b border-obsidian-border px-4 py-2.5">
            {['Budo Product', 'Connected Ad Set', 'Live Decision', 'Inventory', 'ROAS', 'Budget/Day', 'Last Action'].map(h => (
              <span key={h} className="text-text-secondary text-[10px] font-mono uppercase tracking-widest">{h}</span>
            ))}
          </div>

          {/* Rows */}
          {pairs.map((pair) => {
            const pauseInfo = pair.liveDecision === 'PAUSE' ? pauseMap.get(pair.adSetName) ?? null : null;
            const rowBg =
              pair.liveDecision === 'SCALE' ? 'hover:bg-neon-cyan/[0.03]' :
              pair.liveDecision === 'PAUSE' ? 'bg-danger-red/[0.03] hover:bg-danger-red/[0.06]' :
              'hover:bg-obsidian-light';

            return (
              <React.Fragment key={pair.productId}>
                <button
                  className={`w-full grid grid-cols-[1fr_1fr_130px_100px_70px_80px_120px] gap-0 px-4 py-3.5 border-b border-obsidian-border last:border-b-0 transition-colors text-left group relative ${rowBg}`}
                  onClick={() => setExpandedId(expandedId === pair.productId ? null : pair.productId)}
                >
                  {/* Budo Product */}
                  <div className="flex flex-col gap-0.5 min-w-0 pr-2">
                    <span className="text-white text-xs font-bold truncate">{pair.productName}</span>
                    <span className="text-text-secondary text-[10px] font-mono">{pair.category}</span>
                  </div>

                  {/* Connected Ad Set */}
                  <div className="flex flex-col gap-0.5 min-w-0 pr-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-white text-xs truncate">{pair.adSetName}</span>
                      <a
                        href={`https://adsmanager.facebook.com/adsmanager/manage/adsets?act=${(data?.accountId ?? 'act_DEMO').replace('act_', '')}&filter_set=HAS_ID_${pair.adSetId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="shrink-0 flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-[#1877F2]/20 text-[#4493F8]/60 hover:text-[#4493F8] hover:border-[#1877F2]/50 hover:bg-[#1877F2]/10 transition-all text-[9px] font-mono font-bold"
                        title="View this ad set in Meta Ads Manager"
                      >
                        <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.04C6.5 2.04 2 6.53 2 12.06c0 5 3.66 9.15 8.44 9.9v-7H7.9v-2.9h2.54V9.85c0-2.51 1.49-3.89 3.78-3.89 1.09 0 2.23.19 2.23.19v2.47h-1.26c-1.24 0-1.63.77-1.63 1.56v1.88h2.78l-.45 2.9h-2.33v7A10 10 0 0 0 22 12.06C22 6.53 17.5 2.04 12 2.04Z"/></svg>
                        Meta
                      </a>
                    </div>
                    <span className={`text-[10px] font-mono ${pair.adSetStatus === 'ACTIVE' ? 'text-profit-emerald' : 'text-text-secondary'}`}>
                      {pair.adSetStatus} · {pair.adSetId}
                    </span>
                  </div>

                  {/* Live Decision */}
                  <div className="flex items-center">
                    <DecisionBadge decision={pair.liveDecision} reason={pair.liveDecisionReason} />
                  </div>

                  {/* Inventory */}
                  <div className="flex items-center pr-2">
                    <InventoryBar qty={pair.inventory} etsHours={pair.etsHours} />
                  </div>

                  {/* ROAS */}
                  <div className="flex items-center">
                    <RoasCell roas={pair.roas} />
                  </div>

                  {/* Budget */}
                  <div className="flex items-center">
                    <span className="text-xs font-mono text-white tabular-nums">
                      {pair.dailyBudgetUsd != null ? `$${pair.dailyBudgetUsd.toFixed(2)}` : '—'}
                    </span>
                  </div>

                  {/* Last Action */}
                  <div className="flex flex-col gap-0.5">
                    {pair.lastAction ? (
                      <>
                        <span className={`text-[10px] font-bold font-mono ${
                          pair.lastAction === 'SCALE'  ? 'text-neon-cyan' :
                          pair.lastAction === 'PAUSE'  ? 'text-danger-red' :
                          pair.lastAction === 'RESUME' ? 'text-profit-emerald' : 'text-text-secondary'
                        }`}>{pair.lastAction}</span>
                        <span className="text-text-secondary text-[10px]">{pair.lastActionAgo ?? ''}</span>
                      </>
                    ) : (
                      <span className="text-text-secondary text-[10px] font-mono">—</span>
                    )}
                  </div>

                  {/* Hover tooltip for paused rows */}
                  {pair.liveDecision === 'PAUSE' && (
                    <div className="absolute left-4 top-full z-20 hidden group-hover:block pointer-events-none mt-1"
                      style={{ minWidth: '220px' }}>
                      <div className="rounded-xl border border-danger-red/30 px-3 py-2.5 shadow-glass text-xs"
                        style={{ background: 'rgba(10,13,20,0.97)', backdropFilter: 'blur(8px)' }}>
                        <p className="text-danger-red font-bold mb-0.5">
                          ⏸ Safety Pause Active
                        </p>
                        {pauseInfo ? (
                          <>
                            <p className="text-text-secondary">{pauseInfo.reason}</p>
                            <p className="text-text-secondary mt-1">
                              {timeSince(pauseInfo.pausedAt)} · ~<span className="text-profit-emerald font-bold">${pauseInfo.estimatedWasteSavedUsd.toFixed(2)}</span> saved so far
                            </p>
                          </>
                        ) : (
                          <p className="text-text-secondary">{pair.liveDecisionReason}</p>
                        )}
                      </div>
                    </div>
                  )}
                </button>

                {/* Expanded detail row */}
                {expandedId === pair.productId && (
                  <div className="px-4 py-4 border-b border-obsidian-border grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs animate-fade-in-up"
                    style={{ background: 'rgba(7,9,15,0.9)' }}>
                    <div>
                      <p className="text-text-secondary text-[10px] font-mono uppercase tracking-widest mb-1">Live Decision Reason</p>
                      <p className="text-white leading-relaxed">{pair.liveDecisionReason}</p>
                    </div>
                    <div>
                      <p className="text-text-secondary text-[10px] font-mono uppercase tracking-widest mb-1">Funnel Drop-off</p>
                      <p className="text-white">
                        Cart: <span className={pair.dropOff.cart === 'HIGH' ? 'text-danger-red font-bold' : 'text-profit-emerald'}>{pair.dropOff.cart}</span>
                        {' · '}
                        Checkout: <span className={pair.dropOff.checkout === 'HIGH' ? 'text-danger-red font-bold' : 'text-profit-emerald'}>{pair.dropOff.checkout}</span>
                      </p>
                    </div>
                    {pair.lastActionReason && (
                      <div className="sm:col-span-2">
                        <p className="text-text-secondary text-[10px] font-mono uppercase tracking-widest mb-1">Last Action Reason</p>
                        <p className="text-white">{pair.lastActionReason}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-text-secondary text-[10px] font-mono uppercase tracking-widest mb-1">Budo Product ID</p>
                      <p className="text-white font-mono">#{pair.productId} · key: "{pair.mockProductKey}"</p>
                    </div>
                    {pair.spend != null && (
                      <div>
                        <p className="text-text-secondary text-[10px] font-mono uppercase tracking-widest mb-1">Today's Spend</p>
                        <p className="text-white font-mono">${pair.spend.toFixed(2)}</p>
                      </div>
                    )}
                    {pair.etsHours != null && (
                      <div>
                        <p className="text-text-secondary text-[10px] font-mono uppercase tracking-widest mb-1">Inventory Forecast</p>
                        <p className={`font-mono font-bold ${pair.etsHours < 6 ? 'text-danger-red' : pair.etsHours < 12 ? 'text-cyber-amber' : 'text-profit-emerald'}`}>
                          ⏱ Stockout in ~{pair.etsHours < 1 ? `${Math.round(pair.etsHours * 60)}m` : `${pair.etsHours.toFixed(1)}h`}
                          {pair.salesVelocity != null && (
                            <span className="text-text-secondary font-normal ml-2">@ {pair.salesVelocity.toFixed(1)} units/hr</span>
                          )}
                        </p>
                      </div>
                    )}
                    {/* ── Quick Actions ──────────────────────────────── */}
                    <div className="sm:col-span-2">
                      <RowActionBar
                        pair={pair}
                        accountId={data?.accountId ?? 'act_DEMO'}
                        isLive={isLive}
                        onRefresh={fetchStatus}
                      />
                    </div>
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      )}

      {/* ── Action Log ────────────────────────────────────────────────────── */}
      {isLive && <ActionLog />}

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between text-[10px] text-text-secondary font-mono">
        <span>
          {isLive
            ? `Account: ${data?.accountId} · Run #${data?.runCount}`
            : 'Demo mode — start meta-integration backend to go live'}
        </span>
        {lastFetch && <span>Last fetch: {lastFetch} · Polls every 10s</span>}
      </div>
    </div>
  );
};

export default CampaignView;
