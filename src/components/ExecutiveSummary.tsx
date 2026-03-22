import React, { useEffect, useRef, useState } from 'react';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface EngineStatus {
  status:    string;
  account:   string;
  lastRunAt: string | null;
  runCount:  number;
}

interface AdPair {
  liveDecision: 'SCALE' | 'PAUSE' | 'HOLD';
  roas: number | null;
  adSetName: string;
  dailyBudgetUsd: number | null;
  activeSafetyPauses?: { adSetName: string; pauseReason: string }[];
}

interface StatusResponse {
  totalWasteSavedUsd: number;
  activeSafetyPauses: { adSetName: string; pauseReason: string }[];
  pairs: AdPair[];
  siteHealth: string;
  lastRunAt: string | null;
  runCount: number;
  accountId: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string | null): string {
  if (!iso) return 'Never';
  const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 60)  return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  return `${Math.floor(sec / 3600)}h ago`;
}

// ─── Hero KPI Card ─────────────────────────────────────────────────────────────

interface HeroCardProps {
  label:    string;
  value:    string;
  sub?:     string;
  color:    'emerald' | 'cyan' | 'amber' | 'red';
  icon:     string;
  pulse?:   boolean;
}

const CARD_STYLES: Record<HeroCardProps['color'], { border: string; glow: string; text: string; bg: string }> = {
  emerald: { border: 'rgba(16,185,129,0.35)',  glow: '0 0 24px rgba(16,185,129,0.15)', text: '#10B981', bg: 'rgba(16,185,129,0.07)' },
  cyan:    { border: 'rgba(6,214,240,0.35)',   glow: '0 0 24px rgba(6,214,240,0.15)',  text: '#06D6F0', bg: 'rgba(6,214,240,0.07)'  },
  amber:   { border: 'rgba(245,158,11,0.35)',  glow: '0 0 24px rgba(245,158,11,0.15)', text: '#F59E0B', bg: 'rgba(245,158,11,0.07)' },
  red:     { border: 'rgba(220,38,38,0.45)',   glow: '0 0 24px rgba(220,38,38,0.2)',   text: '#EF4444', bg: 'rgba(220,38,38,0.08)'  },
};

const HeroCard: React.FC<HeroCardProps> = ({ label, value, sub, color, icon, pulse }) => {
  const s = CARD_STYLES[color];
  return (
    <div
      className="rounded-2xl border p-6 flex flex-col gap-3 relative overflow-hidden"
      style={{ background: 'rgba(7,9,15,0.97)', borderColor: s.border, boxShadow: s.glow }}
    >
      <div className="flex items-start justify-between">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0"
          style={{ background: s.bg, border: `1px solid ${s.border}` }}
        >
          {icon}
        </div>
        {pulse && (
          <span
            className="w-2.5 h-2.5 rounded-full animate-pulse"
            style={{ background: s.text }}
          />
        )}
      </div>
      <div>
        <p className="text-[10px] font-mono uppercase tracking-widest mb-1" style={{ color: '#6b7280' }}>{label}</p>
        <p className="text-3xl font-black font-mono" style={{ color: s.text }}>{value}</p>
        {sub && <p className="text-xs mt-1.5" style={{ color: '#9ca3af' }}>{sub}</p>}
      </div>
    </div>
  );
};

// ─── Connection Visual ─────────────────────────────────────────────────────────

const ConnectionVisual: React.FC<{ online: boolean; account: string }> = ({ online, account }) => {
  const nodes = [
    { label: 'Your Store',    sub: 'Inventory · Sales',  icon: '🏪', color: '#10B981' },
    { label: 'ScaleAI Brain', sub: 'Decision Engine',    icon: '⚡', color: '#06D6F0' },
    { label: 'Meta Ads',      sub: account || 'Not connected', icon: '📘', color: '#1877F2' },
  ];

  return (
    <div
      className="rounded-2xl border p-6"
      style={{ background: 'rgba(7,9,15,0.97)', borderColor: 'rgba(26,32,48,1)' }}
    >
      <h3 className="text-white font-bold text-xs uppercase tracking-widest mb-5 flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: online ? '#10B981' : '#6b7280' }} />
        Live System Connection
      </h3>

      <div className="flex items-center justify-between gap-2">
        {nodes.map((node, i) => (
          <React.Fragment key={node.label}>
            {/* Node */}
            <div className="flex flex-col items-center gap-2 flex-1">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl border"
                style={{
                  background: `${node.color}12`,
                  borderColor: `${node.color}40`,
                  boxShadow: online ? `0 0 16px ${node.color}20` : 'none',
                }}
              >
                {node.icon}
              </div>
              <div className="text-center">
                <p className="text-white text-xs font-bold">{node.label}</p>
                <p className="text-[10px] font-mono mt-0.5 truncate max-w-[90px] mx-auto" style={{ color: '#6b7280' }}>{node.sub}</p>
              </div>
            </div>

            {/* Arrow between nodes */}
            {i < nodes.length - 1 && (
              <div className="flex flex-col items-center gap-1 shrink-0">
                <div className="flex items-center gap-0.5">
                  {[0, 1, 2].map(j => (
                    <span
                      key={j}
                      className="w-1.5 h-1.5 rounded-full"
                      style={{
                        background: online ? '#06D6F0' : '#374151',
                        opacity: online ? 1 - j * 0.25 : 0.4,
                        animation: online ? `pulse ${1 + j * 0.3}s ease-in-out infinite` : 'none',
                      }}
                    />
                  ))}
                  <span style={{ color: online ? '#06D6F0' : '#374151' }} className="text-xs ml-0.5">→</span>
                </div>
                <span className="text-[9px] font-mono" style={{ color: '#374151' }}>
                  {i === 0 ? 'data' : 'commands'}
                </span>
              </div>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};

// ─── Main Component ────────────────────────────────────────────────────────────

interface ExecutiveSummaryProps {
  onViewCritical?: () => void;
}

export const ExecutiveSummary: React.FC<ExecutiveSummaryProps> = ({ onViewCritical }) => {
  const [status,  setStatus]  = useState<StatusResponse | null>(null);
  const [engine,  setEngine]  = useState<EngineStatus | null>(null);
  const [online,  setOnline]  = useState(false);
  const hasData = useRef(false);

  const fetchAll = async () => {
    try {
      const [sRes, eRes] = await Promise.all([
        fetch('http://localhost:3001/api/status', { signal: AbortSignal.timeout(4000) }),
        fetch('http://localhost:3001/api/health',  { signal: AbortSignal.timeout(4000) }),
      ]);
      const [sJson, eJson] = await Promise.all([sRes.json(), eRes.json()]);
      setStatus(sJson);
      setEngine(eJson);
      setOnline(true);
      hasData.current = true;
    } catch {
      setOnline(false);
    }
  };

  useEffect(() => {
    fetchAll();
    const iv = setInterval(fetchAll, 15_000);
    return () => clearInterval(iv);
  }, []);

  // ── Derived metrics ────────────────────────────────────────────────────────
  const pairs          = status?.pairs ?? [];
  const wasteSaved     = status?.totalWasteSavedUsd ?? 0;
  const criticalPauses = status?.activeSafetyPauses ?? [];
  const criticalCount  = criticalPauses.length;

  const roasPairs  = pairs.filter(p => p.roas !== null && p.roas > 0);
  const avgRoas    = roasPairs.length > 0
    ? (roasPairs.reduce((s, p) => s + (p.roas ?? 0), 0) / roasPairs.length)
    : null;

  const systemColor  = !online ? 'amber' : criticalCount > 0 ? 'red' : 'emerald';
  const systemLabel  = !online ? 'Engine Offline' : criticalCount > 0 ? `${criticalCount} Action${criticalCount > 1 ? 's' : ''} Required` : 'All Systems Optimal';
  const systemSub    = online
    ? `Last run: ${timeAgo(engine?.lastRunAt ?? null)} · Run #${engine?.runCount ?? '—'}`
    : 'Start ./start.sh to activate the engine';

  return (
    <div className="space-y-5">

      {/* ── Hero KPI Row ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <HeroCard
          label="Total Profit Guarded"
          value={`$${wasteSaved.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          sub={criticalCount > 0 ? `${criticalCount} active safety pause${criticalCount > 1 ? 's' : ''}` : 'No active pauses'}
          color="emerald"
          icon="🛡️"
          pulse={wasteSaved > 0}
        />
        <HeroCard
          label="System Status"
          value={systemLabel}
          sub={systemSub}
          color={systemColor}
          icon={!online ? '⚠️' : criticalCount > 0 ? '🚨' : '✅'}
          pulse={online}
        />
        <HeroCard
          label="Live Efficiency"
          value={avgRoas !== null ? `${avgRoas.toFixed(2)}x ROAS` : 'No data yet'}
          sub={roasPairs.length > 0 ? `Across ${roasPairs.length} active ad set${roasPairs.length > 1 ? 's' : ''}` : 'Connect Meta Ads to see live ROAS'}
          color="cyan"
          icon="📈"
          pulse={avgRoas !== null}
        />
      </div>

      {/* ── Critical Action Button ─────────────────────────────────────────── */}
      {criticalCount > 0 && (
        <button
          onClick={onViewCritical}
          className="w-full flex items-center justify-between px-6 py-4 rounded-2xl border font-bold text-sm uppercase tracking-widest transition-all"
          style={{
            background: 'rgba(220,38,38,0.1)',
            borderColor: 'rgba(220,38,38,0.5)',
            color: '#EF4444',
            boxShadow: '0 0 24px rgba(220,38,38,0.15)',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(220,38,38,0.18)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(220,38,38,0.1)'; }}
        >
          <span className="flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
            View {criticalCount} Critical Safety Pause{criticalCount > 1 ? 's' : ''}
          </span>
          <span>→</span>
        </button>
      )}

      {/* ── Safety Pauses Detail ───────────────────────────────────────────── */}
      {criticalCount > 0 && (
        <div
          className="rounded-2xl border overflow-hidden"
          style={{ background: 'rgba(7,9,15,0.97)', borderColor: 'rgba(220,38,38,0.25)' }}
        >
          <div className="px-4 py-3 border-b" style={{ borderColor: 'rgba(220,38,38,0.15)', background: 'rgba(220,38,38,0.06)' }}>
            <p className="text-[10px] font-mono font-bold uppercase tracking-widest" style={{ color: '#EF4444' }}>
              Active Safety Pauses
            </p>
          </div>
          {criticalPauses.map((p, i) => (
            <div key={i} className="flex items-center justify-between px-4 py-3 border-b last:border-b-0"
              style={{ borderColor: 'rgba(26,32,48,1)' }}>
              <div>
                <p className="text-white text-xs font-medium">{p.adSetName}</p>
                <p className="text-[10px] font-mono mt-0.5" style={{ color: '#9ca3af' }}>{p.pauseReason.replace(/_/g, ' ')}</p>
              </div>
              <span className="text-[10px] font-mono font-bold px-2 py-1 rounded-full"
                style={{ background: 'rgba(220,38,38,0.12)', color: '#EF4444', border: '1px solid rgba(220,38,38,0.3)' }}>
                PAUSED
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── Connection Visual ──────────────────────────────────────────────── */}
      <ConnectionVisual online={online} account={engine?.account ?? ''} />

      {/* ── Empty state ────────────────────────────────────────────────────── */}
      {!online && (
        <div
          className="rounded-2xl border px-6 py-5 text-center"
          style={{ background: 'rgba(7,9,15,0.97)', borderColor: 'rgba(26,32,48,1)' }}
        >
          <p className="text-white font-bold text-sm mb-1">Engine Not Running</p>
          <p className="text-xs font-mono" style={{ color: '#9ca3af' }}>
            Run <span className="text-neon-cyan">./start.sh</span> in the terminal, then refresh this page.
          </p>
        </div>
      )}
    </div>
  );
};

export default ExecutiveSummary;
