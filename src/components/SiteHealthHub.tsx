import React from 'react';
import {
  Shield, RefreshCw, CheckCircle, AlertTriangle, Clock,
  Wifi, WifiOff, ChevronRight, Activity,
} from 'lucide-react';
import type { HealthSnapshot, UrlHealthCheck, OverallStatus } from '../lib/SiteHealthService';

// ─── Status helpers ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string; borderColor: string }> = {
  ok:       { label: 'Functional',   color: '#10b981', bgColor: 'rgba(16,185,129,0.08)', borderColor: 'rgba(16,185,129,0.25)' },
  slow:     { label: 'Slow',         color: '#f59e0b', bgColor: 'rgba(245,158,11,0.08)', borderColor: 'rgba(245,158,11,0.25)' },
  error:    { label: 'Error',        color: '#ef4444', bgColor: 'rgba(239,68,68,0.08)',  borderColor: 'rgba(239,68,68,0.25)'  },
  checking: { label: 'Checking…',    color: '#6b7280', bgColor: 'rgba(107,114,128,0.08)', borderColor: 'rgba(107,114,128,0.2)' },
};

const OVERALL_CONFIG: Record<OverallStatus, { color: string; border: string; bg: string }> = {
  Optimal:  { color: '#10b981', border: 'rgba(16,185,129,0.4)',  bg: 'rgba(16,185,129,0.07)' },
  Degraded: { color: '#f59e0b', border: 'rgba(245,158,11,0.4)',  bg: 'rgba(245,158,11,0.07)' },
  Critical: { color: '#ef4444', border: 'rgba(239,68,68,0.4)',   bg: 'rgba(239,68,68,0.07)'  },
  Unknown:  { color: '#6b7280', border: 'rgba(107,114,128,0.3)', bg: 'rgba(107,114,128,0.05)' },
};

// ─── Status badge ──────────────────────────────────────────────────────────────

const StatusBadge: React.FC<{ status: UrlHealthCheck['status'] }> = ({ status }) => {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.ok;
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider"
      style={{ background: cfg.bgColor, border: `1px solid ${cfg.borderColor}`, color: cfg.color }}
    >
      <span className="w-1 h-1 rounded-full" style={{ background: cfg.color }} />
      {cfg.label}
    </span>
  );
};

// ─── Latency bar ───────────────────────────────────────────────────────────────

const LatencyBar: React.FC<{ ms: number | null }> = ({ ms }) => {
  if (ms === null) return <span className="text-[11px] font-mono" style={{ color: '#4b5563' }}>—</span>;
  const color = ms > 1500 ? '#ef4444' : ms > 800 ? '#f59e0b' : '#10b981';
  const pct   = Math.min(100, (ms / 2000) * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-[11px] font-mono tabular-nums" style={{ color }}>{ms}ms</span>
    </div>
  );
};

// ─── Flow check cell ───────────────────────────────────────────────────────────

const FlowCell: React.FC<{ ok: boolean | null; label: string }> = ({ ok, label }) => {
  if (ok === null) return <span className="text-[10px] font-mono" style={{ color: '#4b5563' }}>—</span>;
  return (
    <span className="flex items-center gap-1 text-[10px] font-mono" style={{ color: ok ? '#10b981' : '#ef4444' }}>
      {ok
        ? <CheckCircle size={10} color="#10b981" />
        : <AlertTriangle size={10} color="#ef4444" />}
      {label}
    </span>
  );
};

// ─── Timeline dot ─────────────────────────────────────────────────────────────

const TimelineDot: React.FC<{ snapshot: HealthSnapshot; isLatest: boolean }> = ({ snapshot, isLatest }) => {
  const cfg = OVERALL_CONFIG[snapshot.overallStatus];
  const time = new Date(snapshot.timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="w-3 h-3 rounded-full border-2 relative"
        style={{ background: cfg.color, borderColor: cfg.color, boxShadow: isLatest ? `0 0 8px ${cfg.color}` : 'none' }}
        title={`${snapshot.overallStatus} · ${snapshot.functionalPct}% functional`}
      />
      <span className="text-[9px] font-mono" style={{ color: '#4b5563' }}>{time}</span>
    </div>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────

interface SiteHealthHubProps {
  latest:    HealthSnapshot | null;
  history:   HealthSnapshot[];
  checking:  boolean;
  lastRunAt: string | null;
  nextRunIn: string;
  onRunCheck: () => void;
}

export const SiteHealthHub: React.FC<SiteHealthHubProps> = ({
  latest, history, checking, lastRunAt, nextRunIn, onRunCheck,
}) => {
  const overallCfg = latest
    ? OVERALL_CONFIG[latest.overallStatus]
    : OVERALL_CONFIG['Unknown'];

  return (
    <div className="space-y-5">

      {/* ── Summary bar ─────────────────────────────────────────────────────── */}
      <div
        className="rounded border p-4 flex items-center justify-between flex-wrap gap-4"
        style={{ background: overallCfg.bg, borderColor: overallCfg.border }}
      >
        <div className="flex items-center gap-3">
          <Shield size={20} style={{ color: overallCfg.color }} />
          <div>
            <p className="text-white font-black text-sm uppercase tracking-widest" style={{ fontFamily: 'var(--font-display)' }}>
              {latest ? `Health: ${latest.overallStatus}` : 'Health: Initialising'}
            </p>
            <p className="text-[11px] font-mono mt-0.5" style={{ color: '#6b7280' }}>
              {latest
                ? `${latest.functionalPct}% functional · ${latest.checks.length} URLs monitored · scan took ${latest.durationMs}ms`
                : 'First scan in progress…'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {lastRunAt && (
            <div className="flex items-center gap-1.5 text-[10px] font-mono" style={{ color: '#6b7280' }}>
              <Clock size={10} />
              Last check: {lastRunAt} · Next in {nextRunIn}
            </div>
          )}
          <button
            onClick={onRunCheck}
            disabled={checking}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider disabled:opacity-40 transition-colors"
            style={{
              border: '1px solid var(--brand-muted)',
              color: checking ? '#4b5563' : 'var(--brand-primary)',
              background: 'transparent',
            }}
          >
            <RefreshCw size={10} className={checking ? 'animate-spin' : ''} />
            {checking ? 'Scanning…' : 'Run Now'}
          </button>
        </div>
      </div>

      {/* ── Audit status row ─────────────────────────────────────────────────── */}
      {latest && (
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'URLs Monitored', value: String(latest.checks.length) },
            { label: 'Functional',     value: `${latest.checks.filter(c => c.status === 'ok').length}/${latest.checks.length}` },
            { label: 'Degraded',       value: String(latest.checks.filter(c => c.status === 'slow').length) },
            { label: 'Errors',         value: String(latest.checks.filter(c => c.status === 'error').length) },
          ].map(({ label, value }) => (
            <div key={label} className="rounded border p-3" style={{ background: 'var(--brand-surface-card)', borderColor: 'var(--brand-muted)' }}>
              <p className="text-[10px] font-mono uppercase tracking-widest mb-1" style={{ color: '#4b5563' }}>{label}</p>
              <p className="text-white font-black text-xl" style={{ fontFamily: 'var(--font-display)' }}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Check history timeline ────────────────────────────────────────────── */}
      {history.length > 1 && (
        <div className="rounded border p-4" style={{ background: 'var(--brand-surface-card)', borderColor: 'var(--brand-muted)' }}>
          <p className="text-[10px] font-mono uppercase tracking-widest mb-4" style={{ color: '#4b5563' }}>
            Check History — last {history.length} runs
          </p>
          <div className="flex items-end gap-3">
            {[...history].reverse().map((snap, i) => (
              <TimelineDot key={snap.id} snapshot={snap} isLatest={i === history.length - 1} />
            ))}
            <div className="flex-1 h-px ml-2" style={{ background: 'var(--brand-muted)' }} />
            <div className="flex items-center gap-1 text-[10px] font-mono" style={{ color: '#4b5563' }}>
              <Activity size={10} />
              Now
            </div>
          </div>
          <div className="flex gap-4 mt-3">
            {[
              { color: '#10b981', label: 'Optimal' },
              { color: '#f59e0b', label: 'Degraded' },
              { color: '#ef4444', label: 'Critical' },
            ].map(({ color, label }) => (
              <div key={label} className="flex items-center gap-1.5 text-[10px] font-mono" style={{ color: '#4b5563' }}>
                <span className="w-2 h-2 rounded-full" style={{ background: color }} />
                {label}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Live URL status table ─────────────────────────────────────────────── */}
      {latest && latest.checks.length > 0 ? (
        <div className="rounded border overflow-hidden" style={{ background: 'var(--brand-surface-card)', borderColor: 'var(--brand-muted)' }}>
          {/* Table header */}
          <div
            className="grid gap-0 px-4 py-2.5 border-b"
            style={{
              gridTemplateColumns: '1fr 120px 100px 90px 80px 80px',
              borderColor: 'var(--brand-muted)',
              background: 'rgba(0,0,0,0.2)',
            }}
          >
            {['URL / Page', 'Status', 'Latency', 'HTTP', 'Add to Cart', 'Checkout'].map(h => (
              <span key={h} className="text-[10px] font-mono uppercase tracking-widest" style={{ color: '#4b5563' }}>{h}</span>
            ))}
          </div>

          {/* Rows */}
          {latest.checks.map((check, i) => (
            <div
              key={i}
              className="grid gap-0 px-4 py-3 border-b last:border-b-0 transition-colors"
              style={{
                gridTemplateColumns: '1fr 120px 100px 90px 80px 80px',
                borderColor: 'var(--brand-muted)',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.02)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              {/* URL */}
              <div className="flex flex-col gap-0.5 min-w-0 pr-4">
                <span className="text-white text-xs font-medium truncate">{check.name}</span>
                <span className="text-[10px] font-mono truncate" style={{ color: '#4b5563' }}>{check.url}</span>
                {check.issue && (
                  <span className="text-[10px] font-mono mt-0.5" style={{ color: '#ef4444' }}>
                    <ChevronRight size={9} className="inline" /> {check.issue}
                  </span>
                )}
              </div>

              {/* Status */}
              <div className="flex items-center">
                <StatusBadge status={check.status} />
              </div>

              {/* Latency */}
              <div className="flex items-center">
                <LatencyBar ms={check.latencyMs} />
              </div>

              {/* HTTP code */}
              <div className="flex items-center">
                <span
                  className="text-[11px] font-mono font-bold"
                  style={{ color: check.httpCode === 200 ? '#10b981' : check.httpCode == null ? '#4b5563' : '#ef4444' }}
                >
                  {check.httpCode ?? '—'}
                </span>
              </div>

              {/* Add to Cart */}
              <div className="flex items-center">
                <FlowCell ok={check.addToCartOk} label="OK" />
              </div>

              {/* Checkout */}
              <div className="flex items-center">
                <FlowCell ok={check.checkoutOk} label="OK" />
              </div>
            </div>
          ))}
        </div>
      ) : checking ? (
        <div className="flex items-center justify-center py-12 gap-3">
          <Wifi size={16} className="animate-pulse" style={{ color: 'var(--brand-primary)' }} />
          <span className="text-sm font-mono" style={{ color: '#6b7280' }}>Scanning all URLs…</span>
        </div>
      ) : (
        <div className="flex items-center justify-center py-12 gap-3">
          <WifiOff size={16} style={{ color: '#4b5563' }} />
          <span className="text-sm font-mono" style={{ color: '#4b5563' }}>No check data yet. Click "Run Now" to start.</span>
        </div>
      )}

      {/* Issues summary */}
      {latest && latest.checks.some(c => c.issue) && (
        <div className="rounded border p-4 space-y-2" style={{ background: 'rgba(239,68,68,0.05)', borderColor: 'rgba(239,68,68,0.2)' }}>
          <p className="text-[10px] font-mono uppercase tracking-widest mb-3" style={{ color: '#6b7280' }}>
            Active Issues
          </p>
          {latest.checks.filter(c => c.issue).map((c, i) => (
            <div key={i} className="flex items-start gap-2">
              <AlertTriangle size={12} color="#ef4444" className="mt-0.5 shrink-0" />
              <div>
                <span className="text-xs font-medium text-white">{c.name}</span>
                <span className="text-xs ml-2" style={{ color: '#fca5a5' }}>{c.issue}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-[10px] font-mono" style={{ color: '#374151' }}>
        Guard system monitors all active campaign URLs every 15 minutes. Broken links pause corresponding ad spend automatically.
      </p>
    </div>
  );
};

export default SiteHealthHub;
