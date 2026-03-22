import React, { useEffect, useRef, useState } from 'react';
import Anthropic from '@anthropic-ai/sdk';
import type { DiagnosisReport } from '../lib/scale-engine';

interface InsightTile {
  type: string;
  title: string;
  metric: string;
  context: string;
  action: 'SCALE' | 'PAUSE' | 'INVESTIGATE' | 'OPTIMIZE';
  color: 'green' | 'red' | 'orange' | 'yellow';
  emoji: string;
}

interface LiveInsightsTilesProps {
  report: DiagnosisReport;
  fileNames: string[];
  secondFileContent?: string;
}

const client = new Anthropic({
  apiKey: import.meta.env.VITE_ANTHROPIC_API_KEY,
  dangerouslyAllowBrowser: true,
});

const SYSTEM_PROMPT = `You are "Scale" — Strategic AI Analyst for E-commerce.

Generate exactly 10 Insight Tiles. You MUST cover ALL of the following dimensions — do not skip any that have data:

MANDATORY ANALYSIS DIMENSIONS:
1. PLATFORM — Which platform leads? Which is wasting budget? Compare ROAS across all platforms.
2. COUNTRY/GEO — Which countries convert best? Worst? Any hidden geo opportunity?
3. CAMPAIGN — Top performer and worst performer with exact numbers.
4. CREATIVE FORMAT — Video vs Static performance gap if data exists.
5. AUDIENCE — Retargeting vs Prospecting ROAS ratio (must be ≥ 2×).
6. CONVERSION RATE — Which campaign/country/platform has the worst CR? What does it cost?
7. BUDGET ALLOCATION — Is budget going to the right places? What's the opportunity cost?
8. FUNNEL — Where are users dropping? Which step is the biggest leak?
9. PRODUCTS — If product data exists, which product drives the most revenue or has the highest AOV?
10. CROSS-FILE INSIGHT — If two files: connect campaign spend to product/ecommerce outcomes.

Rules:
- NEVER state the obvious. Every tile must reveal something the user hasn't immediately noticed.
- Use EXACT numbers from the data. No approximations.
- Every tile must drive an immediate action.
- Context sentence: max 14 words, must be action-oriented.
- If a dimension has no data, replace with the next most valuable insight from the data.

Scale Algorithm:
- ROAS > 5.0 = SCALE | 3.0–5.0 = OPTIMIZE | < 3.0 = CRITICAL (break-even = 2.5x, 40% margin)
- Retargeting ROAS must be ≥ 2× Prospecting
- Funnel drop > 30% = DROP | > 50% = FLOW OBSTACLE
- Cart→Checkout drop > 40% = CHECKOUT FRICTION

Return ONLY a JSON array — no markdown, no explanation, no extra text:
[
  {"type":"winner|leak|geo|product|creative|audience|funnel|cross|budget|trend|alert","title":"Max 5 words","metric":"Label: exact value","context":"One sharp action sentence.","action":"SCALE|PAUSE|INVESTIGATE|OPTIMIZE","color":"green|red|orange|yellow","emoji":"single emoji"}
]`;

// ─── Extract complete tiles from a partial JSON stream ─────────────────────────

function extractTilesFromStream(text: string): InsightTile[] {
  const tiles: InsightTile[] = [];
  let depth = 0;
  let inString = false;
  let escape = false;
  let objStart = -1;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (inString) {
      if (ch === '\\') escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === '{') {
      if (depth === 0) objStart = i;
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0 && objStart >= 0) {
        try {
          const obj = JSON.parse(text.slice(objStart, i + 1));
          if (obj.title && obj.metric) tiles.push(obj as InsightTile);
        } catch { /* partial object, skip */ }
        objStart = -1;
      }
    }
  }
  return tiles;
}

// ─── Color config (brand variables) ───────────────────────────────────────────

const COLOR: Record<string, { metricColor: string; borderColor: string; bgColor: string; badgeColor: string; badgeBg: string; badgeBorder: string }> = {
  green: {
    metricColor:  'var(--brand-primary)',
    borderColor:  'color-mix(in srgb, var(--brand-primary) 30%, transparent)',
    bgColor:      'color-mix(in srgb, var(--brand-primary) 5%, transparent)',
    badgeColor:   'var(--brand-primary)',
    badgeBg:      'color-mix(in srgb, var(--brand-primary) 12%, transparent)',
    badgeBorder:  'color-mix(in srgb, var(--brand-primary) 35%, transparent)',
  },
  red: {
    metricColor:  '#ef4444',
    borderColor:  'rgba(239,68,68,0.3)',
    bgColor:      'rgba(239,68,68,0.04)',
    badgeColor:   '#ef4444',
    badgeBg:      'rgba(239,68,68,0.1)',
    badgeBorder:  'rgba(239,68,68,0.3)',
  },
  orange: {
    metricColor:  '#f59e0b',
    borderColor:  'rgba(245,158,11,0.3)',
    bgColor:      'rgba(245,158,11,0.04)',
    badgeColor:   '#f59e0b',
    badgeBg:      'rgba(245,158,11,0.1)',
    badgeBorder:  'rgba(245,158,11,0.3)',
  },
  yellow: {
    metricColor:  '#eab308',
    borderColor:  'rgba(234,179,8,0.3)',
    bgColor:      'rgba(234,179,8,0.04)',
    badgeColor:   '#eab308',
    badgeBg:      'rgba(234,179,8,0.1)',
    badgeBorder:  'rgba(234,179,8,0.3)',
  },
};

const ACTION_LABEL: Record<string, string> = {
  SCALE: 'SCALE', PAUSE: 'PAUSE', INVESTIGATE: 'INVESTIGATE', OPTIMIZE: 'OPTIMIZE',
};

// ─── Skeleton tile ─────────────────────────────────────────────────────────────

const SkeletonTile: React.FC = () => (
  <div
    className="rounded flex flex-col gap-3 animate-pulse"
    style={{
      background: 'var(--brand-surface-card)',
      border: '1px solid var(--brand-muted)',
      padding: '16px',
      minHeight: 140,
    }}
  >
    <div className="flex items-center justify-between">
      <div className="h-2.5 rounded w-2/3" style={{ background: 'var(--brand-muted)' }} />
      <div className="h-4 rounded w-14" style={{ background: 'var(--brand-muted)' }} />
    </div>
    <div className="h-6 rounded w-1/2" style={{ background: 'var(--brand-muted)' }} />
    <div className="h-2.5 rounded w-full mt-1" style={{ background: 'var(--brand-muted)' }} />
    <div className="h-2.5 rounded w-3/4" style={{ background: 'var(--brand-muted)' }} />
  </div>
);

// ─── Tile card ────────────────────────────────────────────────────────────────

const TileCard: React.FC<{ tile: InsightTile }> = ({ tile }) => {
  const cfg = COLOR[tile.color] ?? COLOR.orange;
  return (
    <div
      className="flex flex-col gap-3 transition-transform duration-150 hover:scale-[1.01]"
      style={{
        background: cfg.bgColor,
        border: `1px solid ${cfg.borderColor}`,
        borderRadius: 6,
        padding: '16px',
      }}
    >
      {/* Top row: title + badge */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-base leading-none shrink-0">{tile.emoji}</span>
          <p
            className="font-black uppercase tracking-wide text-[11px] leading-tight text-white"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {tile.title}
          </p>
        </div>
        <span
          className="shrink-0 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded uppercase tracking-widest whitespace-nowrap"
          style={{
            color: cfg.badgeColor,
            background: cfg.badgeBg,
            border: `1px solid ${cfg.badgeBorder}`,
          }}
        >
          {ACTION_LABEL[tile.action] ?? tile.action}
        </span>
      </div>

      {/* Metric */}
      <p
        className="font-black text-xl leading-tight"
        style={{ color: cfg.metricColor, fontFamily: 'var(--font-display)' }}
      >
        {tile.metric}
      </p>

      {/* Context */}
      <p
        className="text-xs leading-relaxed border-t pt-2"
        style={{ color: '#6b7280', borderColor: 'var(--brand-muted)' }}
      >
        {tile.context}
      </p>
    </div>
  );
};

// ─── Main component ────────────────────────────────────────────────────────────

export const LiveInsightsTiles: React.FC<LiveInsightsTilesProps> = ({
  report,
  fileNames,
  secondFileContent,
}) => {
  const [tiles,       setTiles]       = useState<InsightTile[]>([]);
  const [isStreaming, setIsStreaming]  = useState(false);
  const [error,       setError]       = useState('');
  const lastKey = useRef('');

  const reportKey = `${report.totalRevenue}|${report.campaigns.length}|${report.funnelSteps.length}|${report.flags.length}|${fileNames.join(',')}`;

  useEffect(() => {
    if (reportKey === lastKey.current) return;
    if (report.campaigns.length === 0 && report.funnelSteps.length === 0) return;
    lastKey.current = reportKey;
    generateTiles();
  }, [reportKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const generateTiles = async () => {
    setIsStreaming(true);
    setTiles([]);
    setError('');

    const allCampaigns = [...report.campaigns].sort((a, b) => b.revenue - a.revenue);

    const byPlatform: Record<string, { spend: number; revenue: number; conversions: number; count: number }> = {};
    for (const c of report.campaigns) {
      const k = c.platform || 'Unknown';
      if (!byPlatform[k]) byPlatform[k] = { spend: 0, revenue: 0, conversions: 0, count: 0 };
      byPlatform[k].spend       += c.spend;
      byPlatform[k].revenue     += c.revenue;
      byPlatform[k].conversions += c.conversions;
      byPlatform[k].count++;
    }
    const platformStats = Object.entries(byPlatform).map(([platform, v]) => ({
      platform, spend: v.spend, revenue: v.revenue,
      roas: v.spend > 0 ? +(v.revenue / v.spend).toFixed(2) : 0,
      conversions: v.conversions, campaigns: v.count,
    })).sort((a, b) => b.roas - a.roas);

    const byAudience: Record<string, { spend: number; revenue: number; count: number }> = {};
    for (const c of report.campaigns) {
      const k = c.audienceType || 'Unknown';
      if (!byAudience[k]) byAudience[k] = { spend: 0, revenue: 0, count: 0 };
      byAudience[k].spend   += c.spend;
      byAudience[k].revenue += c.revenue;
      byAudience[k].count++;
    }

    const payload = {
      files: fileNames,
      hasSecondFile: !!secondFileContent,
      summary: {
        totalRevenue: report.totalRevenue,
        totalSpend: report.totalSpend,
        blendedRoas: +report.blendedRoas.toFixed(2),
        totalCampaigns: report.campaigns.length,
        criticalCount: report.criticalCampaigns.length,
        scalerCount: report.campaigns.filter(c => c.status === 'SCALE').length,
      },
      campaigns: allCampaigns.map(c => ({
        name: c.name, platform: c.platform, country: c.country,
        spend: c.spend, revenue: c.revenue, roas: +c.roas.toFixed(2),
        ctr: +c.ctr.toFixed(2), cr: +c.conversionRate.toFixed(2),
        conversions: c.conversions, grossProfit: +c.grossProfit.toFixed(0),
        roi: +c.roi.toFixed(1), status: c.status,
        audience: c.audienceType, format: c.format, placement: c.placement,
      })),
      platformBreakdown: platformStats,
      geoBreakdown: report.geoStats.map(g => ({
        country: g.country, roas: +g.roas.toFixed(2), revenue: g.revenue,
        spend: g.spend, aov: +g.aov.toFixed(0), cr: +g.cr.toFixed(2), flag: g.flag,
      })),
      audienceBreakdown: Object.entries(byAudience).map(([type, v]) => ({
        type, spend: v.spend, revenue: v.revenue,
        roas: v.spend > 0 ? +(v.revenue / v.spend).toFixed(2) : 0,
        campaigns: v.count,
      })),
      topScorer: report.topScorer ? {
        name: report.topScorer.name, roas: +report.topScorer.roas.toFixed(2),
        platform: report.topScorer.platform, country: report.topScorer.country,
        spend: report.topScorer.spend, revenue: report.topScorer.revenue,
      } : null,
      criticalCampaigns: report.criticalCampaigns.map(c => ({
        name: c.name, spend: c.spend, roas: +c.roas.toFixed(2),
        platform: c.platform, country: c.country,
      })),
      funnel: report.funnelSteps.map(s => ({
        step: s.label, users: s.users, dropPct: +s.dropPct.toFixed(1), alert: s.alertLevel,
      })),
      biggestLeak: report.biggestLeak,
      checkoutFriction: report.checkoutFriction,
      flags: report.flags.map(f => ({
        type: f.type, severity: f.severity, message: f.message, fix: f.recommendation,
      })),
    };

    try {
      let accumulated = '';

      const stream = client.messages.stream({
        model: 'claude-sonnet-4-6',
        max_tokens: 2400,
        system: SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: `Files: ${fileNames.join(' + ')}\n\n${JSON.stringify(payload)}`,
        }],
      });

      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          accumulated += event.delta.text;
          const partial = extractTilesFromStream(accumulated);
          if (partial.length > 0) setTiles(partial);
        }
      }

      const arrMatch = accumulated.match(/\[[\s\S]*\]/);
      if (arrMatch) {
        try {
          const parsed: InsightTile[] = JSON.parse(arrMatch[0]);
          if (Array.isArray(parsed) && parsed.length > 0) setTiles(parsed);
        } catch { /* keep progressive results */ }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsStreaming(false);
    }
  };

  const TOTAL_TILES = 10;
  const skeletonCount = isStreaming ? Math.max(0, TOTAL_TILES - tiles.length) : 0;

  if (!isStreaming && tiles.length === 0 && !error) return null;

  return (
    <div className="mt-5">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: 'var(--brand-primary)', animation: isStreaming ? 'pulse 1.5s ease-in-out infinite' : 'none' }}
          />
          <span
            className="font-black uppercase tracking-widest text-[10px] text-white"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Scale Live Insights
          </span>
          {isStreaming && tiles.length > 0 && (
            <span className="text-[10px] font-mono" style={{ color: '#6b7280' }}>
              — generating {tiles.length}/{TOTAL_TILES}…
            </span>
          )}
          {!isStreaming && tiles.length > 0 && (
            <span className="text-[10px] font-mono" style={{ color: '#4b5563' }}>
              — {fileNames.join(' + ')}
            </span>
          )}
        </div>
        {!isStreaming && (
          <button
            onClick={generateTiles}
            className="text-[10px] font-mono font-bold uppercase tracking-wider transition-colors"
            style={{ color: '#6b7280' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--brand-primary)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#6b7280'; }}
          >
            ↺ Regenerate
          </button>
        )}
      </div>

      {/* ── Content ─────────────────────────────────────────────────────────── */}
      {error ? (
        <div
          className="flex items-center justify-between rounded p-4"
          style={{ background: 'var(--brand-surface-card)', border: '1px solid var(--brand-muted)' }}
        >
          <p className="text-xs font-mono" style={{ color: '#ef4444' }}>{error}</p>
          <button
            onClick={generateTiles}
            className="ml-4 shrink-0 text-[10px] font-mono font-bold px-3 py-1.5 rounded uppercase tracking-wider"
            style={{ background: 'var(--brand-primary)', color: '#000' }}
          >
            Retry
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {tiles.map((tile, i) => <TileCard key={i} tile={tile} />)}
          {Array.from({ length: skeletonCount }).map((_, i) => <SkeletonTile key={`sk-${i}`} />)}
        </div>
      )}
    </div>
  );
};

export default LiveInsightsTiles;
