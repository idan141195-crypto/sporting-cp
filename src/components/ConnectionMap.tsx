import React, { useEffect, useState } from 'react';

interface ConnectionMapProps {
  className?: string;
}

const API_HEALTH = 'http://localhost:3001/api/health';

// ─── Animated connector line between nodes ────────────────────────────────────

const FlowLine: React.FC<{ direction: 'ltr' | 'rtl'; color: 'cyan' | 'emerald'; label: string }> = ({
  direction, color, label,
}) => {
  const gradFrom = direction === 'ltr'
    ? (color === 'cyan' ? 'from-transparent via-neon-cyan to-transparent' : 'from-transparent via-profit-emerald to-transparent')
    : (color === 'cyan' ? 'from-transparent via-neon-cyan to-transparent' : 'from-transparent via-profit-emerald to-transparent');

  const arrowColor = color === 'cyan' ? 'text-neon-cyan' : 'text-profit-emerald';
  const textColor  = color === 'cyan' ? 'text-neon-cyan/60' : 'text-profit-emerald/60';

  return (
    <div className="flex flex-col items-center gap-1 flex-1">
      <span className={`text-[9px] font-mono uppercase tracking-widest ${textColor}`}>{label}</span>
      <div className="relative w-full flex items-center gap-1">
        {direction === 'rtl' && <span className={`text-xs ${arrowColor} shrink-0`}>◀</span>}
        <div className="flex-1 relative h-px overflow-hidden" style={{ background: 'rgba(26,32,48,0.5)' }}>
          <div
            className={`absolute inset-y-0 w-1/2 bg-gradient-to-r ${gradFrom} opacity-80`}
            style={{ animation: `flow-${direction} 2s linear infinite` }}
          />
        </div>
        {direction === 'ltr' && <span className={`text-xs ${arrowColor} shrink-0`}>▶</span>}
      </div>
    </div>
  );
};

// ─── Node box ─────────────────────────────────────────────────────────────────

const Node: React.FC<{
  icon: string;
  title: string;
  subtitle: string;
  metrics: string[];
  accent: 'cyan' | 'emerald' | 'amber';
  status?: 'online' | 'offline' | 'unknown';
}> = ({ icon, title, subtitle, metrics, accent, status }) => {
  const borderColor = accent === 'cyan' ? 'border-neon-cyan/25' : accent === 'emerald' ? 'border-profit-emerald/25' : 'border-cyber-amber/25';
  const titleColor  = accent === 'cyan' ? 'text-neon-cyan'      : accent === 'emerald' ? 'text-profit-emerald'      : 'text-cyber-amber';
  const dotColor    = status === 'online' ? 'bg-profit-emerald animate-pulse' : status === 'offline' ? 'bg-muted-gray' : 'bg-cyber-amber animate-pulse';

  return (
    <div
      className={`rounded-2xl border ${borderColor} px-4 py-3.5 flex flex-col gap-2 min-w-[160px] flex-1`}
      style={{ background: 'rgba(10,13,20,0.9)', backdropFilter: 'blur(8px)' }}
    >
      <div className="flex items-center gap-2">
        <span className="text-xl">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className={`text-xs font-bold uppercase tracking-widest ${titleColor}`}>{title}</p>
            {status && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} />}
          </div>
          <p className="text-text-secondary text-[10px] font-mono">{subtitle}</p>
        </div>
      </div>
      <div className="border-t border-obsidian-border pt-2 space-y-0.5">
        {metrics.map((m, i) => (
          <p key={i} className="text-text-secondary text-[10px] font-mono flex items-center gap-1">
            <span className={`w-1 h-1 rounded-full shrink-0 ${titleColor.replace('text-', 'bg-')}`} />
            {m}
          </p>
        ))}
      </div>
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

export const ConnectionMap: React.FC<ConnectionMapProps> = ({ className = '' }) => {
  const [engineStatus, setEngineStatus] = useState<'online' | 'offline' | 'unknown'>('unknown');
  const [runCount,     setRunCount]     = useState<number | null>(null);
  const [lastRunAt,    setLastRunAt]    = useState<string | null>(null);

  useEffect(() => {
    const check = async () => {
      try {
        const res  = await fetch(API_HEALTH, { signal: AbortSignal.timeout(3000) });
        const json = await res.json();
        setEngineStatus('online');
        setRunCount(json.runCount ?? null);
        setLastRunAt(json.lastRunAt ?? null);
      } catch {
        setEngineStatus('offline');
      }
    };
    check();
    const iv = setInterval(check, 15_000);
    return () => clearInterval(iv);
  }, []);

  const lastRunLabel = lastRunAt
    ? new Date(lastRunAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : null;

  return (
    <>
      {/* Inject keyframes via a style tag */}
      <style>{`
        @keyframes flow-ltr {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
        @keyframes flow-rtl {
          0%   { transform: translateX(200%); }
          100% { transform: translateX(-100%); }
        }
      `}</style>

      <div
        className={`rounded-2xl border border-obsidian-border px-5 py-4 ${className}`}
        style={{ background: 'rgba(7,9,15,0.95)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-white font-display font-black uppercase tracking-widest text-xs flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${engineStatus === 'online' ? 'bg-profit-emerald animate-pulse' : 'bg-muted-gray'}`} />
              Live Data Bridge
            </h3>
            <p className="text-text-secondary text-[10px] font-mono mt-0.5">
              {engineStatus === 'online'
                ? `Engine online${runCount !== null ? ` · Run #${runCount}` : ''}${lastRunLabel ? ` · Last run ${lastRunLabel}` : ''}`
                : 'Engine offline — start: node src/index.js'}
            </p>
          </div>
          <span className={`text-[10px] font-mono font-bold px-2.5 py-1 rounded-full border ${
            engineStatus === 'online'
              ? 'text-profit-emerald border-profit-emerald/30 bg-profit-emerald/10'
              : 'text-muted-gray border-obsidian-border bg-transparent'
          }`}>
            {engineStatus === 'online' ? '● CONNECTED' : '○ OFFLINE'}
          </span>
        </div>

        {/* Three-node diagram */}
        <div className="flex items-center gap-3">

          {/* Node 1: Budo Inventory */}
          <Node
            icon="🏪"
            title="Budo Store"
            subtitle="Inventory Simulator"
            accent="emerald"
            status={engineStatus}
            metrics={['Stock Levels (units)', 'Sales Velocity (units/hr)', 'Site Health Status', 'Funnel Drop-off Rates']}
          />

          {/* Connector: Budo → ScaleAI */}
          <div className="flex flex-col gap-2 flex-1 min-w-[80px]">
            <FlowLine direction="ltr" color="emerald" label="Store Data" />
            <FlowLine direction="rtl" color="cyan"    label="Decisions" />
          </div>

          {/* Node 2: ScaleAI Engine */}
          <Node
            icon="⚙️"
            title="ScaleAI"
            subtitle="Node.js Engine"
            accent="cyan"
            status={engineStatus}
            metrics={['ROAS Decision Rules', 'Safety Guardrails', 'Budget Change Limits', 'Learning Phase Guard']}
          />

          {/* Connector: ScaleAI → Meta */}
          <div className="flex flex-col gap-2 flex-1 min-w-[80px]">
            <FlowLine direction="ltr" color="cyan"    label="Budget Commands" />
            <FlowLine direction="rtl" color="emerald" label="Live Insights" />
          </div>

          {/* Node 3: Meta */}
          <Node
            icon="📘"
            title="Meta Ads"
            subtitle="Graph API v20.0"
            accent="amber"
            status={engineStatus}
            metrics={['Ad Set Budgets ($)', 'Campaign Status', 'ROAS / Spend', 'Real-time Insights']}
          />
        </div>

        {/* Legend / footnote */}
        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-obsidian-border flex-wrap">
          <span className="text-profit-emerald text-[10px] font-mono flex items-center gap-1.5">
            <span className="w-3 h-px bg-profit-emerald inline-block" /> Inventory & store signals
          </span>
          <span className="text-neon-cyan text-[10px] font-mono flex items-center gap-1.5">
            <span className="w-3 h-px bg-neon-cyan inline-block" /> Budget decisions & API calls
          </span>
          <span className="text-text-secondary text-[10px] font-mono ml-auto">
            Engine runs every 15 min · Polls every 10s
          </span>
        </div>
      </div>
    </>
  );
};

export default ConnectionMap;
