import React, { useEffect, useState } from 'react';
import { useToast } from './Toast';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LiveAdSet {
  adSetId:        string;
  adSetName:      string;
  status:         string;
  dailyBudgetUsd: number;
  roas:           number | null;
  spend:          number | null;
  impressions:    number | null;
  clicks:         number | null;
  viewInMetaUrl:  string;
}

interface LiveFeedResponse {
  accountId:      string;
  totalBudgetUsd: number;
  totalAdSets:    number;
  topAdSets:      LiveAdSet[];
  fetchedAt:      string;
  error?:         string;
}

const API_BASE     = 'http://localhost:3001';
const REFRESH_MS   = 30_000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function roasColor(roas: number | null): string {
  if (roas === null) return 'text-text-secondary';
  if (roas > 5)  return 'text-profit-emerald';
  if (roas >= 3) return 'text-white';
  return 'text-danger-red';
}

function statusDot(status: string): string {
  return status === 'ACTIVE' ? 'bg-profit-emerald animate-pulse' : 'bg-muted-gray';
}

// ─── Row Action ───────────────────────────────────────────────────────────────

const FeedRowActions: React.FC<{ adSet: LiveAdSet; onRefresh: () => void }> = ({ adSet, onRefresh }) => {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const applyAction = async (type: 'pause' | 'resume' | 'scale_budget', factor?: number) => {
    setBusy(true);
    try {
      const res  = await fetch(`${API_BASE}/api/apply-action`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ type, adSetId: adSet.adSetId, adSetName: adSet.adSetName, factor }),
      });
      const json = await res.json();
      if (json.success) {
        toast({ variant: 'meta', title: 'Confirmed by Meta', body: json.message });
        onRefresh();
      } else {
        toast({ variant: 'error', title: 'Action Failed', body: json.error ?? 'Unknown error' });
      }
    } catch {
      toast({ variant: 'error', title: 'Backend Unreachable', body: 'Make sure the API server is running.' });
    } finally {
      setBusy(false);
    }
  };

  const isActive = adSet.status === 'ACTIVE';

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {isActive ? (
        <>
          <button onClick={() => applyAction('pause')} disabled={busy}
            className="text-[10px] font-mono font-bold px-2 py-1 rounded-lg border border-danger-red/30 text-danger-red hover:bg-danger-red/10 transition-colors disabled:opacity-40">
            ⏸ Pause
          </button>
          <button onClick={() => applyAction('scale_budget', 1.15)} disabled={busy}
            className="text-[10px] font-mono font-bold px-2 py-1 rounded-lg border border-neon-cyan/30 text-neon-cyan hover:bg-neon-cyan/10 transition-colors disabled:opacity-40">
            ⚡ +15%
          </button>
        </>
      ) : (
        <button onClick={() => applyAction('resume')} disabled={busy}
          className="text-[10px] font-mono font-bold px-2 py-1 rounded-lg border border-profit-emerald/30 text-profit-emerald hover:bg-profit-emerald/10 transition-colors disabled:opacity-40">
          ▶ Resume
        </button>
      )}
      <a
        href={adSet.viewInMetaUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[10px] font-mono font-bold px-2 py-1 rounded-lg border border-obsidian-border text-text-secondary hover:text-neon-cyan hover:border-neon-cyan/30 transition-colors"
        title="Open in Meta Ads Manager"
      >
        ↗ Meta
      </a>
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

export const MetaLiveFeed: React.FC = () => {
  const [data,    setData]    = useState<LiveFeedResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchAt, setFetchAt] = useState<string | null>(null);

  const fetchFeed = async () => {
    try {
      const res  = await fetch(`${API_BASE}/api/live-feed`, { signal: AbortSignal.timeout(6000) });
      const json: LiveFeedResponse = await res.json();
      setData(json);
      setFetchAt(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    } catch {
      // silently fail — backend might be offline
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFeed();
    const iv = setInterval(fetchFeed, REFRESH_MS);
    return () => clearInterval(iv);
  }, []);

  // Don't render if backend is clearly offline and no data
  if (!loading && !data) return null;

  const isError = data?.error != null;

  return (
    <div className="rounded-2xl border border-obsidian-border overflow-hidden animate-fade-in-up"
      style={{ background: 'rgba(7,9,15,0.95)' }}>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-obsidian-border"
        style={{ background: 'rgba(10,13,20,0.8)' }}>
        <div>
          <h3 className="text-white font-bold text-xs uppercase tracking-widest flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${data && !isError ? 'bg-profit-emerald animate-pulse' : 'bg-muted-gray'}`} />
            Meta Account — Live Feed
          </h3>
          <p className="text-text-secondary text-[10px] font-mono mt-0.5">
            {isError
              ? `Error: ${data?.error}`
              : data
              ? `${data.accountId} · ${data.totalAdSets} active ad sets · Total budget $${data.totalBudgetUsd?.toFixed(2)}/day`
              : 'Connecting…'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {fetchAt && (
            <span className="text-text-secondary text-[10px] font-mono">
              {fetchAt}
            </span>
          )}
          <button
            onClick={fetchFeed}
            className="text-[10px] font-mono text-text-secondary hover:text-neon-cyan border border-obsidian-border hover:border-neon-cyan/30 px-2 py-1 rounded-lg transition-colors"
          >
            ↺
          </button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center h-24 gap-3">
          <span className="w-5 h-5 rounded-full border-2 border-neon-cyan/30 border-t-neon-cyan animate-spin" />
          <p className="text-text-secondary text-xs font-mono">Fetching live ad sets from Meta…</p>
        </div>
      ) : isError || !data?.topAdSets?.length ? (
        <div className="flex flex-col items-center justify-center h-24 text-center px-6">
          <p className="text-text-secondary text-xs font-mono">
            {isError ? 'Could not reach Meta API — check token and account ID in .env' : 'No active ad sets found in this account.'}
          </p>
        </div>
      ) : (
        <>
          {/* Table header */}
          <div className="grid grid-cols-[1fr_90px_70px_70px_60px_160px] gap-0 border-b border-obsidian-border px-4 py-2">
            {['Ad Set', 'Budget/Day', 'ROAS', 'Spend', 'Status', 'Actions'].map(h => (
              <span key={h} className="text-text-secondary text-[10px] font-mono uppercase tracking-widest">{h}</span>
            ))}
          </div>

          {/* Rows */}
          {data.topAdSets.map((adSet, i) => (
            <div
              key={adSet.adSetId}
              className="grid grid-cols-[1fr_90px_70px_70px_60px_160px] gap-0 px-4 py-3 border-b border-obsidian-border last:border-b-0 hover:bg-white/[0.02] transition-colors"
            >
              {/* Ad Set Name */}
              <div className="flex flex-col gap-0.5 min-w-0 pr-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-text-secondary text-[10px] font-mono shrink-0">{i + 1}</span>
                  <span className="text-white text-xs font-medium truncate">{adSet.adSetName}</span>
                </div>
                <span className="text-text-secondary text-[10px] font-mono">{adSet.adSetId}</span>
              </div>

              {/* Budget */}
              <div className="flex items-center">
                <span className="text-white text-xs font-mono tabular-nums">
                  ${adSet.dailyBudgetUsd.toFixed(2)}
                </span>
              </div>

              {/* ROAS */}
              <div className="flex items-center">
                <span className={`text-xs font-mono font-bold tabular-nums ${roasColor(adSet.roas)}`}>
                  {adSet.roas != null ? `${adSet.roas.toFixed(2)}x` : '—'}
                </span>
              </div>

              {/* Spend */}
              <div className="flex items-center">
                <span className="text-text-secondary text-xs font-mono tabular-nums">
                  {adSet.spend != null ? `$${adSet.spend.toFixed(2)}` : '—'}
                </span>
              </div>

              {/* Status */}
              <div className="flex items-center">
                <span className="flex items-center gap-1.5 text-[10px] font-mono">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDot(adSet.status)}`} />
                  <span className={adSet.status === 'ACTIVE' ? 'text-profit-emerald' : 'text-text-secondary'}>
                    {adSet.status}
                  </span>
                </span>
              </div>

              {/* Actions */}
              <div className="flex items-center">
                <FeedRowActions adSet={adSet} onRefresh={fetchFeed} />
              </div>
            </div>
          ))}
        </>
      )}

      {/* Footer note */}
      {data && !isError && (
        <div className="px-4 py-2 border-t border-obsidian-border">
          <p className="text-text-secondary text-[10px] font-mono">
            Top 5 by ROAS · All ad sets in account · Actions execute directly in Meta Business Manager
          </p>
        </div>
      )}
    </div>
  );
};

export default MetaLiveFeed;
