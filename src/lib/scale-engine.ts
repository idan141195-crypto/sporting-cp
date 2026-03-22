// ─────────────────────────────────────────────────────────────────────────────
// ZOLTER INTELLIGENCE ENGINE  v2 — Deep Pattern Detection
// ─────────────────────────────────────────────────────────────────────────────

export type TrendSignal = 'improving' | 'stable' | 'decaying' | 'new';

export interface ParsedCampaign {
  name: string;
  platform: string;
  country: string;
  spend: number;
  revenue: number;
  roas: number;
  ctr: number;
  conversions: number;
  conversionRate: number;
  grossProfit: number;
  roi: number;
  status: 'SCALE' | 'OPTIMIZE' | 'CRITICAL';
  action: string;
  trendSignal: TrendSignal;
  audienceType?: 'Prospecting' | 'Retargeting';
  format?: 'Video' | 'Static';
  placement?: 'Feed' | 'Stories' | 'Reels';
}

export interface ParsedFunnelStep {
  label: string;
  users: number;
  dropPct: number;
  alertLevel: 'none' | 'warn' | 'critical';
}

export interface GeoStat {
  country: string;
  revenue: number;
  spend: number;
  roas: number;
  aov: number;
  cr: number;
  flag: 'SCALE' | 'WATCH' | null;
}

export interface PatternInsight {
  id: string;
  type: 'opportunity' | 'risk' | 'trend';
  pattern: string;
  detail: string;
  priority: 'High' | 'Medium' | 'Low';
  estimatedMonthlyImpact: string;
  action: string;
}

export interface DiagnosticFlag {
  id: string;
  type: 'CRITICAL_BUDGET_WASTE' | 'CONTENT_MISALIGNMENT' | 'FLOW_OBSTACLE' |
        'CHECKOUT_FRICTION' | 'UX_FRICTION_MOBILE' | 'LOW_CONVERSION_RATE' |
        'RETARGETING_UNDERPERFORMING' | 'VIDEO_ENGAGEMENT_NO_CONVERSION';
  severity: 'critical' | 'warning';
  message: string;
  recommendation: string;
}

export interface DiagnosisReport {
  generatedAt: string;

  // Layer 1: Campaign performance
  campaigns: ParsedCampaign[];
  topScorer: ParsedCampaign | null;
  criticalCampaigns: ParsedCampaign[];
  totalSpend: number;
  totalRevenue: number;
  blendedRoas: number;

  // Layer 2: Funnel health
  funnelSteps: ParsedFunnelStep[];
  biggestLeak: { step: string; dropPct: number } | null;
  checkoutFriction: boolean;

  // Layer 3: Geographic analysis
  geoStats: GeoStat[];
  topCountry: GeoStat | null;

  // Layer 4: Flags & alerts
  flags: DiagnosticFlag[];

  // Layer 5: Deep pattern intelligence
  patterns: PatternInsight[];
}

// ─── CSV Parser ───────────────────────────────────────────────────────────────

export function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const delim = lines[0].includes('\t') ? '\t' : ',';
  const headers = lines[0].split(delim).map((h) =>
    h.replace(/^["']|["']$/g, '').trim().toLowerCase()
  );
  return lines.slice(1)
    .filter((l) => l.trim())
    .map((line) => {
      const vals = line.split(delim).map((v) => v.replace(/^["']|["']$/g, '').trim());
      const row: Record<string, string> = {};
      headers.forEach((h, i) => { row[h] = vals[i] ?? ''; });
      return row;
    });
}

function col(row: Record<string, string>, ...names: string[]): string {
  for (const n of names) {
    const key = Object.keys(row).find((k) => k.toLowerCase().includes(n.toLowerCase()));
    if (key && row[key] !== undefined && row[key] !== '') return row[key];
  }
  return '';
}

function num(v: string): number {
  if (!v) return 0;
  return parseFloat(v.replace(/[$,%€]/g, '').replace(/,/g, '')) || 0;
}

// ─── Trend computation ────────────────────────────────────────────────────────

function computeTrend(roas: number, ctr: number, conversionRate: number, spend: number): TrendSignal {
  if (spend === 0) return 'new';
  // Improving: strong ROAS with solid conversion
  if (roas > 5.5 && conversionRate > 2.0) return 'improving';
  // Also improving: consistently above scale threshold
  if (roas > 5.0 && ctr > 2 && ctr < 8) return 'improving';
  // Decaying: burning budget with no intent signal
  if (roas < 2.5) return 'decaying';
  if (ctr > 6 && roas < 3.0) return 'decaying'; // high engagement, zero purchase intent
  if (conversionRate > 0 && conversionRate < 0.8) return 'decaying';
  return 'stable';
}

// ─── Zolter Campaign Algorithm ────────────────────────────────────────────────

const GROSS_MARGIN = 0.40;

function computeStatus(roas: number): 'SCALE' | 'OPTIMIZE' | 'CRITICAL' {
  if (roas > 5.0) return 'SCALE';
  if (roas >= 3.0) return 'OPTIMIZE';
  return 'CRITICAL';
}

function computeAction(c: Omit<ParsedCampaign, 'status' | 'action' | 'trendSignal'>): string {
  const { roas, ctr, format, audienceType, country } = c;

  if (roas > 5.0) {
    return `Scale: Increase budget +15%. Top performer in ${country || 'this market'}.`;
  }
  if (roas >= 3.0) {
    const hints: string[] = [];
    if (ctr > 5 && roas < 4) hints.push('High CTR but low ROAS — review landing page relevance');
    if (format === 'Video' && roas < 4) hints.push('Video drives engagement, not purchase intent — test static creatives');
    if (audienceType === 'Prospecting') hints.push('Test retargeting audience — typically 2× higher ROAS');
    hints.push(`Audit CTR, creative, and audience targeting for ${country || 'this market'}`);
    return `Optimize: ${hints.join('. ')}.`;
  }
  const hints: string[] = ['Pause immediately'];
  if (roas < 2.5) hints.push('Operating at a loss (40% gross margin)');
  if (ctr > 5) hints.push('High CTR with low ROAS = engagement interest, zero purchase intent');
  if (c.conversionRate < 1.5) hints.push(`CR ${c.conversionRate.toFixed(2)}% is a flow obstacle — fix landing page`);
  return hints.join('. ') + '.';
}

export function analyzeCampaigns(rows: Record<string, string>[]): ParsedCampaign[] {
  return rows.map((row, i) => {
    const spend   = num(col(row, 'spend', 'cost', 'budget', 'amount'));
    const revenue = num(col(row, 'revenue', 'sales', 'value', 'income', 'purchase'));
    const convs   = num(col(row, 'conversion', 'purchase', 'orders', 'sales count'));
    const clicks  = num(col(row, 'clicks', 'click'));
    const impr    = num(col(row, 'impression', 'reach', 'views'));

    const roas = spend > 0
      ? (num(col(row, 'roas')) || (revenue / spend))
      : num(col(row, 'roas'));

    const ctr = num(col(row, 'ctr')) ||
      (impr > 0 ? (clicks / impr) * 100 : 0);

    const convRate = num(col(row, 'conversion rate', 'cr', 'cvr')) ||
      (clicks > 0 && convs > 0 ? (convs / clicks) * 100 : 0);

    const grossProfit = revenue * GROSS_MARGIN;
    const roi = spend > 0 ? ((grossProfit - spend) / spend) * 100 : 0;
    const status = computeStatus(roas);
    const trendSignal = computeTrend(roas, ctr, convRate, spend);

    const partial: Omit<ParsedCampaign, 'status' | 'action' | 'trendSignal'> = {
      name:           col(row, 'campaign', 'name', 'ad set', 'adset') || `Campaign ${i + 1}`,
      platform:       col(row, 'platform', 'channel', 'source', 'network') || 'Unknown',
      country:        col(row, 'country', 'region', 'market', 'geo', 'location') || '—',
      spend, revenue, roas, ctr,
      conversions:    convs,
      conversionRate: convRate,
      grossProfit,
      roi,
      audienceType:   (col(row, 'audience', 'type').toLowerCase().includes('retarget')
                        ? 'Retargeting' : 'Prospecting'),
      format:         col(row, 'format', 'creative').toLowerCase().includes('video')
                        ? 'Video' : 'Static',
      placement:      (['Feed', 'Stories', 'Reels'] as const).find(
                        (p) => col(row, 'placement').toLowerCase().includes(p.toLowerCase())
                      ),
    };

    return { ...partial, status, action: computeAction(partial), trendSignal };
  });
}

// ─── Funnel Analysis ──────────────────────────────────────────────────────────

export function analyzeFunnel(rows: Record<string, string>[]): ParsedFunnelStep[] {
  const steps = rows.map((row) => ({
    label: col(row, 'step', 'stage', 'page', 'event', 'name') || Object.values(row)[0] || '?',
    users: num(col(row, 'users', 'sessions', 'visits', 'count', 'views', 'visitors',
                    'sessions', 'pageviews') || Object.values(row)[1] || '0'),
  })).filter((s) => s.users > 0);

  return steps.map((step, i) => {
    const prev = steps[i - 1];
    const dropPct = prev && prev.users > 0
      ? ((prev.users - step.users) / prev.users) * 100
      : 0;
    const alertLevel: ParsedFunnelStep['alertLevel'] =
      dropPct >= 50 ? 'critical' : dropPct >= 30 ? 'warn' : 'none';
    return { ...step, dropPct, alertLevel };
  });
}

// ─── Geographic Analysis ──────────────────────────────────────────────────────

function buildGeoStats(campaigns: ParsedCampaign[]): GeoStat[] {
  const map: Record<string, { revenue: number; spend: number; conversions: number; orders: number }> = {};

  for (const c of campaigns) {
    const k = c.country || 'Unknown';
    if (!map[k]) map[k] = { revenue: 0, spend: 0, conversions: 0, orders: 0 };
    map[k].revenue     += c.revenue;
    map[k].spend       += c.spend;
    map[k].conversions += c.conversions;
    map[k].orders      += c.conversions;
  }

  const globalRevenue = Object.values(map).reduce((s, v) => s + v.revenue, 0);
  const globalOrders  = Object.values(map).reduce((s, v) => s + v.orders, 0);
  const globalAov     = globalOrders > 0 ? globalRevenue / globalOrders : 0;
  const globalCr      = campaigns.reduce((s, c) => s + c.conversionRate, 0) / Math.max(campaigns.length, 1);

  return Object.entries(map).map(([country, v]) => {
    const roas = v.spend > 0 ? v.revenue / v.spend : 0;
    const aov  = v.orders > 0 ? v.revenue / v.orders : 0;
    const cr   = campaigns.filter((c) => c.country === country)
                          .reduce((s, c) => s + c.conversionRate, 0) /
                 Math.max(campaigns.filter((c) => c.country === country).length, 1);

    const flag: GeoStat['flag'] =
      (aov > globalAov * 1.2 || cr > globalCr * 1.2) ? 'SCALE' :
      (roas < 3) ? 'WATCH' : null;

    return { country, revenue: v.revenue, spend: v.spend, roas, aov, cr, flag };
  }).sort((a, b) => b.roas - a.roas);
}

// ─── Diagnostic Flags ─────────────────────────────────────────────────────────

function buildFlags(campaigns: ParsedCampaign[], funnelSteps: ParsedFunnelStep[]): DiagnosticFlag[] {
  const flags: DiagnosticFlag[] = [];

  campaigns.forEach((c) => {
    if (c.conversionRate > 0 && c.conversionRate < 1.5 && c.status !== 'SCALE') {
      flags.push({
        id: `cr-${c.name}`,
        type: 'LOW_CONVERSION_RATE',
        severity: c.conversionRate < 1 ? 'critical' : 'warning',
        message: `${c.name}: CR is ${c.conversionRate.toFixed(2)}% — below the 1.5% floor.`,
        recommendation: `Audit landing page for ${c.country}. Check load speed, above-fold offer, and CTA visibility.`,
      });
    }
  });

  campaigns
    .filter((c) => c.format === 'Video' && c.ctr > 4 && c.roas < 3.5)
    .forEach((c) => {
      flags.push({
        id: `video-${c.name}`,
        type: 'VIDEO_ENGAGEMENT_NO_CONVERSION',
        severity: 'warning',
        message: `${c.name}: Video CTR ${c.ctr.toFixed(1)}% but ROAS only ${c.roas.toFixed(1)}x — engagement without intent.`,
        recommendation: 'Split-test static product creatives. Add price/offer overlay to video.',
      });
    });

  const retargetingCampaigns = campaigns.filter((c) => c.audienceType === 'Retargeting');
  const prospectingCampaigns = campaigns.filter((c) => c.audienceType === 'Prospecting');
  if (retargetingCampaigns.length > 0 && prospectingCampaigns.length > 0) {
    const avgRetarget = retargetingCampaigns.reduce((s, c) => s + c.roas, 0) / retargetingCampaigns.length;
    const avgProspect = prospectingCampaigns.reduce((s, c) => s + c.roas, 0) / prospectingCampaigns.length;
    if (avgRetarget < avgProspect * 2) {
      flags.push({
        id: 'retarget-underperform',
        type: 'RETARGETING_UNDERPERFORMING',
        severity: 'warning',
        message: `Retargeting ROAS (${avgRetarget.toFixed(1)}x) is less than 2× Prospecting (${avgProspect.toFixed(1)}x).`,
        recommendation: 'Narrow retargeting window to 14 days. Exclude existing buyers. Refresh creative.',
      });
    }
  }

  const cartStep     = funnelSteps.find((s) => s.label.toLowerCase().includes('cart'));
  const checkoutStep = funnelSteps.find((s) => s.label.toLowerCase().includes('checkout') || s.label.toLowerCase().includes('initiate'));
  if (cartStep && checkoutStep && checkoutStep.dropPct > 40) {
    flags.push({
      id: 'checkout-friction',
      type: 'CHECKOUT_FRICTION',
      severity: checkoutStep.dropPct > 60 ? 'critical' : 'warning',
      message: `Cart → Checkout drop: ${checkoutStep.dropPct.toFixed(0)}%. Shipping costs or payment methods revealed too late.`,
      recommendation: 'Show shipping estimate on product page. Add payment icons (Apple Pay, PayPal) above the fold on Cart page.',
    });
  }

  funnelSteps.forEach((step) => {
    if (step.alertLevel === 'critical') {
      flags.push({
        id: `funnel-${step.label}`,
        type: 'FLOW_OBSTACLE',
        severity: 'critical',
        message: `Flow obstacle at "${step.label}": ${step.dropPct.toFixed(0)}% of users lost here.`,
        recommendation: `Investigate ${step.label} page: load time, UX friction, content mismatch from ads.`,
      });
    }
  });

  return flags;
}

// ─── Deep Pattern Detection ───────────────────────────────────────────────────

function detectPatterns(
  campaigns: ParsedCampaign[],
  funnelSteps: ParsedFunnelStep[],
  geoStats: GeoStat[],
  totalSpend: number,
  totalRevenue: number,
): PatternInsight[] {
  const patterns: PatternInsight[] = [];

  // Pattern: Scale opportunity
  const improving = campaigns.filter(c => c.trendSignal === 'improving');
  if (improving.length > 0) {
    const avgRoas = improving.reduce((s, c) => s + c.roas, 0) / improving.length;
    const daySpend = improving.reduce((s, c) => s + c.spend, 0);
    const monthlyGain = daySpend * 0.15 * (avgRoas - 1) * 30;
    patterns.push({
      id: 'scale-opportunity',
      type: 'opportunity',
      pattern: 'Scale Opportunity',
      detail: `${improving.length} campaign${improving.length > 1 ? 's' : ''} above ROAS threshold (avg ${avgRoas.toFixed(1)}x). Current daily spend $${daySpend.toFixed(0)} is under-capitalised.`,
      priority: 'High',
      estimatedMonthlyImpact: `+$${monthlyGain.toFixed(0)}/mo`,
      action: `Increase budget +15% on: ${improving.slice(0, 3).map(c => c.name).join(', ')}. Monitor ROAS every 24h.`,
    });
  }

  // Pattern: Critical budget waste
  const critSpend = campaigns.filter(c => c.status === 'CRITICAL').reduce((s, c) => s + c.spend, 0);
  if (critSpend > totalSpend * 0.15 && critSpend > 0) {
    const topRoas = campaigns.filter(c => c.status === 'SCALE')[0]?.roas ?? 5;
    const monthlyGain = critSpend * (topRoas - 1) * 30;
    patterns.push({
      id: 'critical-budget-waste',
      type: 'risk',
      pattern: 'Critical Budget Waste',
      detail: `$${critSpend.toFixed(0)}/day (${((critSpend / totalSpend) * 100).toFixed(0)}% of total spend) allocated to CRITICAL campaigns operating below break-even.`,
      priority: 'High',
      estimatedMonthlyImpact: `+$${monthlyGain.toFixed(0)}/mo if reallocated`,
      action: `Pause all CRITICAL campaigns. Reallocate $${critSpend.toFixed(0)}/day to top SCALE performers.`,
    });
  }

  // Pattern: Video engagement gap (high CTR, low intent)
  const videoDecaying = campaigns.filter(c => c.format === 'Video' && c.trendSignal === 'decaying');
  const videoAll      = campaigns.filter(c => c.format === 'Video');
  if (videoDecaying.length >= 2 || (videoAll.length >= 2 && videoAll.filter(c => c.ctr > 5 && c.roas < 3.5).length >= 2)) {
    const wastedSpend = videoDecaying.reduce((s, c) => s + c.spend, 0) || videoAll.reduce((s, c) => s + c.spend, 0) * 0.4;
    patterns.push({
      id: 'video-engagement-gap',
      type: 'risk',
      pattern: 'Video Engagement Gap',
      detail: `${videoDecaying.length || videoAll.length} video campaigns generating high CTR without purchase intent. Impressions are not converting to revenue.`,
      priority: 'High',
      estimatedMonthlyImpact: `+$${(wastedSpend * 0.3 * 30).toFixed(0)}/mo`,
      action: 'Shift 30–40% of video budget to static product ads. Add price overlay and clear CTA to remaining videos.',
    });
  }

  // Pattern: Geographic concentration risk
  if (geoStats.length > 0 && totalRevenue > 0) {
    const topPct = (geoStats[0].revenue / totalRevenue) * 100;
    if (topPct > 65) {
      patterns.push({
        id: 'geo-concentration',
        type: 'risk',
        pattern: 'Geographic Concentration Risk',
        detail: `${topPct.toFixed(0)}% of revenue from ${geoStats[0].country}. Single-market dependency creates revenue volatility and ROAS fragility.`,
        priority: 'Medium',
        estimatedMonthlyImpact: `Risk exposure: -$${(geoStats[0].revenue * 0.15).toFixed(0)}/mo if disrupted`,
        action: `Test campaigns in ${geoStats.length > 1 ? geoStats[1].country : 'a second market'} with 10% of ${geoStats[0].country} budget. Diversify.`,
      });
    }
  }

  // Pattern: Retargeting underexploited
  const retCampaigns = campaigns.filter(c => c.audienceType === 'Retargeting');
  const prosCampaigns = campaigns.filter(c => c.audienceType === 'Prospecting');
  if (retCampaigns.length > 0 && prosCampaigns.length > 0) {
    const avgRet = retCampaigns.reduce((s, c) => s + c.roas, 0) / retCampaigns.length;
    const avgPro = prosCampaigns.reduce((s, c) => s + c.roas, 0) / prosCampaigns.length;
    if (avgRet < avgPro * 1.8) {
      const prosSpend = prosCampaigns.reduce((s, c) => s + c.spend, 0);
      patterns.push({
        id: 'retargeting-gap',
        type: 'opportunity',
        pattern: 'Retargeting Opportunity',
        detail: `Retargeting ROAS (${avgRet.toFixed(1)}x) is only ${(avgRet / avgPro).toFixed(1)}× prospecting (${avgPro.toFixed(1)}x). Expected ratio: 2×+. Warm audience is undermonetised.`,
        priority: 'Medium',
        estimatedMonthlyImpact: `+$${(prosSpend * 0.1 * avgRet * 30).toFixed(0)}/mo`,
        action: 'Increase retargeting budget 20%. Narrow window to 14-day visitors. Exclude existing buyers. Refresh creative.',
      });
    }
  }

  // Pattern: Checkout funnel friction
  const checkoutFunnelStep = funnelSteps.find(s =>
    s.label.toLowerCase().includes('checkout') || s.label.toLowerCase().includes('initiate')
  );
  if (checkoutFunnelStep && checkoutFunnelStep.dropPct > 45) {
    const cartUsers = funnelSteps.find(s => s.label.toLowerCase().includes('cart'))?.users ?? 0;
    const recoverableUsers = cartUsers * (checkoutFunnelStep.dropPct / 100) * 0.12;
    const avgOrderVal = totalRevenue > 0
      ? totalRevenue / Math.max(campaigns.reduce((s, c) => s + c.conversions, 0), 1)
      : 50;
    patterns.push({
      id: 'checkout-friction-pattern',
      type: 'risk',
      pattern: 'Checkout Friction Detected',
      detail: `${checkoutFunnelStep.dropPct.toFixed(0)}% of cart visitors abandon at checkout initiation. Unexpected shipping cost or payment method gap likely cause.`,
      priority: 'High',
      estimatedMonthlyImpact: `+$${(recoverableUsers * avgOrderVal).toFixed(0)}/mo`,
      action: 'Show shipping cost estimate on product page. Add Apple Pay / PayPal. Reduce checkout form to ≤3 steps.',
    });
  }

  // Pattern: Decaying campaign cluster
  const decaying = campaigns.filter(c => c.trendSignal === 'decaying');
  if (decaying.length >= 3) {
    patterns.push({
      id: 'decay-cluster',
      type: 'risk',
      pattern: 'Campaign Decay Cluster',
      detail: `${decaying.length} campaigns showing decay signal (high spend, low or falling ROAS). Creative fatigue or audience saturation likely.`,
      priority: 'Medium',
      estimatedMonthlyImpact: `Risk: -$${(decaying.reduce((s, c) => s + c.spend, 0) * 30).toFixed(0)}/mo ongoing`,
      action: 'Refresh creative across all decaying campaigns. Test new audience segments. Rotate ad copy immediately.',
    });
  }

  // Sort: High → Medium → Low, then opportunity before risk
  const priorityOrder = { 'High': 0, 'Medium': 1, 'Low': 2 };
  const typeOrder     = { 'opportunity': 0, 'risk': 1, 'trend': 2 };
  return patterns.sort((a, b) =>
    priorityOrder[a.priority] - priorityOrder[b.priority] ||
    typeOrder[a.type] - typeOrder[b.type]
  );
}

// ─── File type detection ──────────────────────────────────────────────────────

export type FileType = 'campaigns' | 'funnel' | 'unknown';

export function detectFileType(rows: Record<string, string>[]): FileType {
  if (rows.length === 0) return 'unknown';
  const headers = Object.keys(rows[0]).join(' ').toLowerCase();
  const cScore = ['spend', 'roas', 'revenue', 'platform', 'campaign', 'ctr', 'impression'].filter(s => headers.includes(s)).length;
  const fScore = ['step', 'stage', 'funnel', 'sessions', 'landing', 'checkout', 'cart', 'purchase'].filter(s => headers.includes(s)).length;
  if (cScore > fScore) return 'campaigns';
  if (fScore > cScore) return 'funnel';
  if (cScore > 0) return 'campaigns';
  if (fScore > 0) return 'funnel';
  return 'unknown';
}

// ─── Main: Run Full Diagnosis ─────────────────────────────────────────────────

export function runDiagnosis(campaignCSV?: string, funnelCSV?: string): DiagnosisReport {
  let campaignRows: Record<string, string>[] = [];
  let funnelRows:   Record<string, string>[] = [];

  if (campaignCSV) {
    const rows = parseCSV(campaignCSV);
    const type = detectFileType(rows);
    if (type === 'campaigns') campaignRows = rows;
    else if (type === 'funnel') funnelRows = rows;
  }
  if (funnelCSV) {
    const rows = parseCSV(funnelCSV);
    const type = detectFileType(rows);
    if (type === 'funnel') funnelRows = rows;
    else if (type === 'campaigns' && campaignRows.length === 0) campaignRows = rows;
  }
  if (campaignCSV && !funnelCSV && campaignRows.length === 0) {
    campaignRows = parseCSV(campaignCSV);
  }

  const campaigns   = campaignRows.length > 0 ? analyzeCampaigns(campaignRows) : [];
  const funnelSteps = funnelRows.length   > 0 ? analyzeFunnel(funnelRows)      : [];
  const geoStats    = buildGeoStats(campaigns);
  const flags       = buildFlags(campaigns, funnelSteps);

  const totalSpend   = campaigns.reduce((s, c) => s + c.spend, 0);
  const totalRevenue = campaigns.reduce((s, c) => s + c.revenue, 0);
  const blendedRoas  = totalSpend > 0 ? totalRevenue / totalSpend : 0;

  const sorted            = [...campaigns].sort((a, b) => b.roas - a.roas);
  const topScorer         = sorted[0] ?? null;
  const criticalCampaigns = campaigns.filter((c) => c.status === 'CRITICAL');

  const biggestLeak = funnelSteps.length > 0
    ? funnelSteps.reduce((worst, s) => s.dropPct > worst.dropPct ? s : worst, funnelSteps[0])
    : null;

  const cartIdx     = funnelSteps.findIndex((s) => s.label.toLowerCase().includes('cart'));
  const checkoutIdx = funnelSteps.findIndex((s) => s.label.toLowerCase().includes('checkout'));
  const checkoutFriction = cartIdx >= 0 && checkoutIdx > cartIdx && funnelSteps[checkoutIdx].dropPct > 40;

  const patterns = detectPatterns(campaigns, funnelSteps, geoStats, totalSpend, totalRevenue);

  return {
    generatedAt: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
    campaigns, topScorer, criticalCampaigns,
    totalSpend, totalRevenue, blendedRoas,
    funnelSteps,
    biggestLeak: biggestLeak ? { step: biggestLeak.label, dropPct: biggestLeak.dropPct } : null,
    checkoutFriction,
    geoStats, topCountry: geoStats[0] ?? null,
    flags,
    patterns,
  };
}

// ─── pruneCSV ─────────────────────────────────────────────────────────────────

const CAMPAIGN_COLS = ['campaign','name','platform','spend','revenue','roas','ctr',
  'clicks','impressions','conversions','country','audience','format','placement'];
const FUNNEL_COLS = ['step','stage','page','name','users','sessions','visits'];

export function pruneCSV(text: string): string {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return text;
  const delim = lines[0].includes('\t') ? '\t' : ',';
  const rawHeaders = lines[0].split(delim).map((h) => h.replace(/^["']|["']$/g, '').trim().toLowerCase());
  const isCampaign =
    CAMPAIGN_COLS.filter((c) => rawHeaders.some((h) => h.includes(c))).length >=
    FUNNEL_COLS.filter((c) => rawHeaders.some((h) => h.includes(c))).length;
  const allowList = isCampaign ? CAMPAIGN_COLS : FUNNEL_COLS;
  const keepIdx = rawHeaders
    .map((h, i) => ({ h, i }))
    .filter(({ h }) => allowList.some((a) => h.includes(a)))
    .map(({ i }) => i);
  if (keepIdx.length === 0) return text;
  return lines.map((line) => {
    const vals = line.split(delim);
    return keepIdx.map((i) => vals[i] ?? '').join(delim);
  }).join('\n');
}

// ─── summarizeForLLM ──────────────────────────────────────────────────────────

export function summarizeForLLM(report: DiagnosisReport, maxCampaigns = 15): string {
  const sortedBySpend = [...report.campaigns].sort((a, b) => b.spend - a.spend);
  const sortedByRoas  = [...report.campaigns].sort((a, b) => b.roas - a.roas);
  const critical = report.campaigns.filter((c) => c.status === 'CRITICAL');
  const combined = [...sortedBySpend.slice(0, maxCampaigns)];
  for (const c of critical) {
    if (!combined.find((x) => x.name === c.name)) combined.push(c);
  }
  return JSON.stringify({
    summary: {
      totalCampaigns: report.campaigns.length,
      totalSpend: report.totalSpend,
      totalRevenue: report.totalRevenue,
      blendedRoas: +report.blendedRoas.toFixed(2),
      criticalCount: critical.length,
    },
    top3ByRoas: sortedByRoas.slice(0, 3).map(c => ({
      name: c.name, platform: c.platform, country: c.country,
      roas: +c.roas.toFixed(2), spend: c.spend, status: c.status, trendSignal: c.trendSignal,
    })),
    bottom3ByRoas: sortedByRoas.slice(-3).map(c => ({
      name: c.name, platform: c.platform, country: c.country,
      roas: +c.roas.toFixed(2), spend: c.spend, status: c.status, trendSignal: c.trendSignal,
    })),
    patterns: report.patterns.map(p => ({ pattern: p.pattern, priority: p.priority, impact: p.estimatedMonthlyImpact })),
    campaigns: combined.map(c => ({
      name: c.name, platform: c.platform, country: c.country,
      spend: c.spend, revenue: c.revenue, roas: +c.roas.toFixed(2),
      status: c.status, ctr: +c.ctr.toFixed(1), conversions: c.conversions,
      conversionRate: +c.conversionRate.toFixed(2), trendSignal: c.trendSignal,
    })),
  }, null, 2);
}

// ─── Format diagnosis as chat message ────────────────────────────────────────

export function formatDiagnosisMessage(r: DiagnosisReport): string {
  const lines: string[] = [];

  lines.push(`**Analysis — ${r.generatedAt}**`);
  lines.push('');

  if (r.campaigns.length > 0) {
    lines.push(`**Campaign Performance** (${r.campaigns.length} campaigns)`);
    lines.push(`Blended ROAS: **${r.blendedRoas.toFixed(2)}x** | Revenue: **$${r.totalRevenue.toLocaleString()}** | Spend: **$${r.totalSpend.toLocaleString()}**`);
    lines.push('');

    if (r.topScorer) {
      lines.push(`Top performer: ${r.topScorer.name} (${r.topScorer.platform} · ${r.topScorer.country}) — ROAS **${r.topScorer.roas.toFixed(1)}x**`);
      lines.push(`→ ${r.topScorer.action}`);
      lines.push('');
    }

    if (r.criticalCampaigns.length > 0) {
      lines.push(`**Critical — Pause immediately (${r.criticalCampaigns.length}):**`);
      r.criticalCampaigns.forEach((c) => {
        lines.push(`• ${c.name} (${c.platform} · ${c.country}) ROAS ${c.roas.toFixed(1)}x — ${c.action}`);
      });
      lines.push('');
    }

    const optimize = r.campaigns.filter((c) => c.status === 'OPTIMIZE');
    if (optimize.length > 0) {
      lines.push(`**Optimize (${optimize.length}):**`);
      optimize.forEach((c) => {
        lines.push(`• ${c.name} — ROAS ${c.roas.toFixed(1)}x. ${c.action}`);
      });
      lines.push('');
    }
  }

  if (r.patterns.length > 0) {
    lines.push(`**Pattern Intelligence (${r.patterns.length} signals detected):**`);
    r.patterns.slice(0, 3).forEach((p) => {
      lines.push(`• [${p.priority}] ${p.pattern}: ${p.detail}`);
      lines.push(`  Action: ${p.action}`);
      lines.push(`  Estimated impact: ${p.estimatedMonthlyImpact}`);
    });
    lines.push('');
  }

  if (r.funnelSteps.length > 0) {
    lines.push(`**Funnel Health**`);
    r.funnelSteps.forEach((s) => {
      const marker = s.alertLevel === 'critical' ? '[CRITICAL]' : s.alertLevel === 'warn' ? '[WARN]' : '[OK]';
      const drop = s.dropPct > 0 ? ` (−${s.dropPct.toFixed(0)}%)` : '';
      lines.push(`${marker} ${s.label}: **${s.users.toLocaleString()}** users${drop}`);
    });
    if (r.biggestLeak) lines.push(`\nBiggest leak: "${r.biggestLeak.step}" — ${r.biggestLeak.dropPct.toFixed(0)}% drop`);
    if (r.checkoutFriction) lines.push(`Checkout friction — shipping/payment revealed too late`);
    lines.push('');
  }

  if (r.geoStats.length > 0) {
    lines.push(`**Top Markets**`);
    r.geoStats.slice(0, 3).forEach((g) => {
      const badge = g.flag === 'SCALE' ? ' [SCALE]' : g.flag === 'WATCH' ? ' [WATCH]' : '';
      lines.push(`• ${g.country}: ROAS ${g.roas.toFixed(1)}x | Revenue $${g.revenue.toLocaleString()}${badge}`);
    });
    lines.push('');
  }

  if (r.flags.length > 0) {
    lines.push(`**Technical Issues (${r.flags.length})**`);
    r.flags.forEach((f) => {
      lines.push(`[${f.severity.toUpperCase()}] ${f.message}`);
      lines.push(`  → ${f.recommendation}`);
    });
    lines.push('');
  }

  lines.push(`_Ask me to drill into any campaign, country, funnel step, or pattern._`);
  return lines.join('\n');
}

// ─── Answer question ──────────────────────────────────────────────────────────

export function answerQuestion(question: string, report: DiagnosisReport | null): string {
  const q = question.toLowerCase();

  if (!report || (report.campaigns.length === 0 && report.funnelSteps.length === 0)) {
    return 'No data loaded yet. Upload a CSV file and I\'ll run the full analysis instantly.';
  }

  if (/scale|top|best|winner|scorer/.test(q)) {
    const scalers = report.campaigns.filter((c) => c.status === 'SCALE');
    if (scalers.length === 0) return 'No campaigns qualify for SCALE (ROAS > 5.0) right now.';
    const lines = [`**${scalers.length} campaign(s) ready to SCALE:**`];
    scalers.forEach((c) => lines.push(`• ${c.name} — ROAS **${c.roas.toFixed(1)}x** (${c.country}) · ${c.trendSignal}\n  ${c.action}`));
    return lines.join('\n');
  }

  if (/pause|stop|critical|kill|cut/.test(q)) {
    if (report.criticalCampaigns.length === 0) return 'No campaigns below break-even.';
    const lines = [`**Pause these ${report.criticalCampaigns.length} campaigns NOW:**`];
    report.criticalCampaigns.forEach((c) => {
      lines.push(`• **${c.name}** (${c.platform} · ${c.country})`);
      lines.push(`  ROAS: ${c.roas.toFixed(1)}x | CR: ${c.conversionRate.toFixed(2)}% | Trend: ${c.trendSignal}`);
      lines.push(`  ${c.action}`);
    });
    const savings = report.criticalCampaigns.reduce((s, c) => s + c.spend, 0);
    lines.push(`\nFreed budget: **$${savings.toLocaleString()}** → reallocate to ${report.topScorer?.name ?? 'top performers'}.`);
    return lines.join('\n');
  }

  if (/pattern|trend|insight|signal/.test(q)) {
    if (report.patterns.length === 0) return 'No patterns detected. Upload more data for deeper analysis.';
    const lines = [`**${report.patterns.length} patterns detected:**`];
    report.patterns.forEach(p => {
      lines.push(`\n[${p.priority}] **${p.pattern}** (${p.type})`);
      lines.push(p.detail);
      lines.push(`Estimated impact: ${p.estimatedMonthlyImpact}`);
      lines.push(`Action: ${p.action}`);
    });
    return lines.join('\n');
  }

  if (/funnel|leak|pipe|drop|checkout|cart/.test(q)) {
    if (report.funnelSteps.length === 0) return 'No funnel data loaded.';
    const lines = ['**Funnel Analysis:**'];
    report.funnelSteps.forEach((s) => {
      const marker = s.alertLevel === 'critical' ? '[CRITICAL]' : s.alertLevel === 'warn' ? '[WARN]' : '[OK]';
      lines.push(`${marker} ${s.label}: ${s.users.toLocaleString()} users${s.dropPct > 0 ? ` (−${s.dropPct.toFixed(0)}%)` : ''}`);
    });
    if (report.biggestLeak) lines.push(`\nBiggest leak: "${report.biggestLeak.step}" — ${report.biggestLeak.dropPct.toFixed(0)}% abandon here.`);
    if (report.checkoutFriction) lines.push('\nCheckout friction confirmed. Show shipping + payment options earlier.');
    return lines.join('\n');
  }

  if (/countr|market|geo|region/.test(q)) {
    if (report.geoStats.length === 0) return 'No geographic data found.';
    const lines = ['**Market Performance:**'];
    report.geoStats.forEach((g) => {
      const badge = g.flag === 'SCALE' ? ' [SCALE]' : g.flag === 'WATCH' ? ' [WATCH]' : '';
      lines.push(`• **${g.country}${badge}**: ROAS ${g.roas.toFixed(1)}x | Revenue $${g.revenue.toLocaleString()} | AOV $${g.aov.toFixed(0)}`);
    });
    if (report.topCountry) lines.push(`\nBest market: ${report.topCountry.country} (ROAS ${report.topCountry.roas.toFixed(1)}x).`);
    return lines.join('\n');
  }

  if (/roas|roi|profit|return/.test(q)) {
    const lines = [`**Blended ROAS: ${report.blendedRoas.toFixed(2)}x**`];
    const status = report.blendedRoas > 5 ? 'SCALE' : report.blendedRoas >= 3 ? 'OPTIMIZE' : 'CRITICAL';
    lines.push(`Status: ${status}`);
    lines.push('');
    [...report.campaigns].sort((a, b) => b.roas - a.roas).forEach((c) => {
      lines.push(`• ${c.name}: **${c.roas.toFixed(1)}x** [${c.status}] · ${c.trendSignal}`);
    });
    return lines.join('\n');
  }

  return formatDiagnosisMessage(report);
}
