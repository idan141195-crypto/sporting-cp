import React, { useEffect, useState } from 'react';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface HealthResponse {
  status:    string;
  account:   string;
  lastRunAt: string | null;
  runCount:  number;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(iso: string | null): string {
  if (!iso) return 'never';
  const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 60)  return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  return `${Math.floor(sec / 3600)}h ago`;
}

// ─── Component ─────────────────────────────────────────────────────────────────

export const MetaStatusCard: React.FC = () => {
  const [health,  setHealth]  = useState<HealthResponse | null>(null);
  const [online,  setOnline]  = useState(false);
  const [fetchAt, setFetchAt] = useState<string | null>(null);

  const fetchHealth = async () => {
    try {
      const res  = await fetch('http://localhost:3001/api/health', { signal: AbortSignal.timeout(4000) });
      const json: HealthResponse = await res.json();
      setHealth(json);
      setOnline(true);
      setFetchAt(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    } catch {
      setOnline(false);
    }
  };

  useEffect(() => {
    fetchHealth();
    const iv = setInterval(fetchHealth, 30_000);
    return () => clearInterval(iv);
  }, []);

  const accountId  = health?.account ?? null;
  const accountNum = accountId ? accountId.replace('act_', '') : '';

  const campaignsUrl = accountNum
    ? `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${accountNum}`
    : 'https://adsmanager.facebook.com';
  const adSetsUrl = accountNum
    ? `https://adsmanager.facebook.com/adsmanager/manage/adsets?act=${accountNum}`
    : 'https://adsmanager.facebook.com';
  const reportsUrl = accountNum
    ? `https://adsmanager.facebook.com/adsmanager/reporting/manage?act=${accountNum}`
    : 'https://adsmanager.facebook.com';

  return (
    <div
      className="rounded-2xl border overflow-hidden animate-fade-in-up"
      style={{
        background: 'rgba(7,9,15,0.97)',
        borderColor: online ? 'rgba(24,119,242,0.35)' : 'rgba(26,32,48,1)',
        boxShadow: online ? '0 0 24px rgba(24,119,242,0.12)' : 'none',
      }}
    >
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between px-5 py-3.5 border-b"
        style={{
          background: online ? 'rgba(24,119,242,0.07)' : 'rgba(10,13,20,0.8)',
          borderColor: online ? 'rgba(24,119,242,0.2)' : 'rgba(26,32,48,1)',
        }}
      >
        <div className="flex items-center gap-3">
          {/* Facebook icon */}
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: online ? 'rgba(24,119,242,0.15)' : 'rgba(26,32,48,0.8)' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill={online ? '#4493F8' : '#6b7280'}>
              <path d="M12 2.04C6.5 2.04 2 6.53 2 12.06c0 5 3.66 9.15 8.44 9.9v-7H7.9v-2.9h2.54V9.85c0-2.51 1.49-3.89 3.78-3.89 1.09 0 2.23.19 2.23.19v2.47h-1.26c-1.24 0-1.63.77-1.63 1.56v1.88h2.78l-.45 2.9h-2.33v7A10 10 0 0 0 22 12.06C22 6.53 17.5 2.04 12 2.04Z"/>
            </svg>
          </div>
          <div>
            <h3 className="text-white font-bold text-xs uppercase tracking-widest flex items-center gap-2">
              Meta Business Manager
            </h3>
            <p className="text-[10px] font-mono mt-0.5" style={{ color: online ? '#4493F8' : '#6b7280' }}>
              {accountId ?? 'No account connected'}
            </p>
          </div>
        </div>

        {/* Status badge */}
        <div className="flex items-center gap-2">
          {fetchAt && (
            <span className="text-[10px] font-mono" style={{ color: '#6b7280' }}>{fetchAt}</span>
          )}
          <span
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold font-mono uppercase tracking-widest border"
            style={online
              ? { background: 'rgba(24,119,242,0.1)', borderColor: 'rgba(24,119,242,0.35)', color: '#4493F8' }
              : { background: 'rgba(26,32,48,0.5)', borderColor: 'rgba(26,32,48,1)', color: '#6b7280' }
            }
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${online ? 'animate-pulse' : ''}`}
              style={{ background: online ? '#4493F8' : '#6b7280' }}
            />
            {online ? 'Connected' : 'Offline'}
          </span>
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────────────────────── */}
      <div className="px-5 py-4 flex flex-col sm:flex-row items-start sm:items-center gap-5">

        {/* Stats row */}
        <div className="flex gap-6 flex-1">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-widest" style={{ color: '#6b7280' }}>Ad Account</p>
            <p className="text-white text-sm font-mono font-bold mt-0.5">
              {accountId ?? '—'}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-mono uppercase tracking-widest" style={{ color: '#6b7280' }}>Sync Status</p>
            <p className="text-sm font-bold mt-0.5" style={{ color: online ? '#10B981' : '#6b7280' }}>
              {online ? '● Live' : '○ Offline'}
            </p>
          </div>
          <div className="hidden sm:block">
            <p className="text-[10px] font-mono uppercase tracking-widest" style={{ color: '#6b7280' }}>Last Engine Run</p>
            <p className="text-white text-sm font-mono mt-0.5">
              {timeAgo(health?.lastRunAt ?? null)}
            </p>
          </div>
          <div className="hidden md:block">
            <p className="text-[10px] font-mono uppercase tracking-widest" style={{ color: '#6b7280' }}>Optimizer Runs</p>
            <p className="text-white text-sm font-mono font-bold mt-0.5">
              #{health?.runCount ?? '—'}
            </p>
          </div>
        </div>

        {/* CTA buttons */}
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          {/* Secondary quick links */}
          <a
            href={adSetsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] font-mono font-bold px-2.5 py-1.5 rounded-lg border transition-all"
            style={{ borderColor: 'rgba(26,32,48,1)', color: '#9ca3af' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(24,119,242,0.4)'; (e.currentTarget as HTMLElement).style.color = '#4493F8'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(26,32,48,1)'; (e.currentTarget as HTMLElement).style.color = '#9ca3af'; }}
          >
            Ad Sets ↗
          </a>
          <a
            href={reportsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] font-mono font-bold px-2.5 py-1.5 rounded-lg border transition-all"
            style={{ borderColor: 'rgba(26,32,48,1)', color: '#9ca3af' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(24,119,242,0.4)'; (e.currentTarget as HTMLElement).style.color = '#4493F8'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(26,32,48,1)'; (e.currentTarget as HTMLElement).style.color = '#9ca3af'; }}
          >
            Reports ↗
          </a>

          {/* Primary CTA */}
          <a
            href={campaignsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-xs uppercase tracking-widest transition-all"
            style={{
              background: 'rgba(24,119,242,0.15)',
              border: '1px solid rgba(24,119,242,0.45)',
              color: '#4493F8',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(24,119,242,0.28)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(24,119,242,0.15)'; }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2.04C6.5 2.04 2 6.53 2 12.06c0 5 3.66 9.15 8.44 9.9v-7H7.9v-2.9h2.54V9.85c0-2.51 1.49-3.89 3.78-3.89 1.09 0 2.23.19 2.23.19v2.47h-1.26c-1.24 0-1.63.77-1.63 1.56v1.88h2.78l-.45 2.9h-2.33v7A10 10 0 0 0 22 12.06C22 6.53 17.5 2.04 12 2.04Z"/>
            </svg>
            Go to Ad Account
          </a>
        </div>
      </div>

      {/* ── Footer note ─────────────────────────────────────────────────────── */}
      <div
        className="px-5 py-2 border-t text-[10px] font-mono"
        style={{ borderColor: 'rgba(26,32,48,1)', color: '#6b7280' }}
      >
        {online
          ? `ScaleAI engine is running · Budget changes you apply here will be reflected in Meta Business Manager within seconds`
          : `Backend offline — start with ./start.sh · actions will not sync to Meta until the engine is running`}
      </div>
    </div>
  );
};

export default MetaStatusCard;
