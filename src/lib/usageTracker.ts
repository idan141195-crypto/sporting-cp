// ─── Usage Tracker ─────────────────────────────────────────────────────────
// localStorage-based quota system. Resets automatically each calendar month.

export const COSTS = {
  flux_schnell: 0.003,   // ~$0.003 per Flux-schnell image
  luma_dream:   0.50,    // ~$0.50 per Luma video (conservative)
  gpt4o_mini:   0.002,   // ~$0.002 per copy generation
  claude:        0.01,   // ~$0.01 per AI Writer message
} as const;

export const PLANS = {
  starter: { label: 'Starter ($100/mo)', maxImages: 10, maxVideos: 2  },
  pro:     { label: 'Pro ($250/mo)',     maxImages: 50, maxVideos: 10 },
} as const;

export type PlanKey = keyof typeof PLANS;
export type AssetType = 'image' | 'video' | 'copy' | 'writer';

export interface CostEvent {
  ts:      string;       // ISO timestamp
  type:    AssetType;
  model:   string;
  costUSD: number;
  label:   string;       // e.g. product name or prompt snippet
}

export interface UsageData {
  month:   string;       // 'YYYY-MM'
  plan:    PlanKey;
  images:  number;       // premium image count (Flux)
  videos:  number;       // video count (Luma)
  events:  CostEvent[];
}

const LS_KEY = 'scaleai_usage_v1';

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

export function getUsage(): UsageData {
  try {
    const raw  = localStorage.getItem(LS_KEY);
    const data = raw ? (JSON.parse(raw) as UsageData) : null;
    if (data && data.month === currentMonth()) return data;
  } catch { /* ignore */ }
  return { month: currentMonth(), plan: 'starter', images: 0, videos: 0, events: [] };
}

export function recordEvent(event: Omit<CostEvent, 'ts'>): void {
  const data = getUsage();
  if (event.type === 'image')  data.images++;
  if (event.type === 'video')  data.videos++;
  data.events.push({ ...event, ts: new Date().toISOString() });
  try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch { /* ignore */ }
}

export function setPlan(plan: PlanKey): void {
  const data = getUsage();
  data.plan  = plan;
  try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch { /* ignore */ }
}

export function canGenerate(type: 'image' | 'video'): boolean {
  const data   = getUsage();
  const limits = PLANS[data.plan];
  if (type === 'image') return data.images < limits.maxImages;
  if (type === 'video') return data.videos < limits.maxVideos;
  return true;
}

export function totalCostUSD(data: UsageData): number {
  return data.events.reduce((sum, e) => sum + e.costUSD, 0);
}

export function clearUsage(): void {
  localStorage.removeItem(LS_KEY);
}
