// ─── Asset Cache ───────────────────────────────────────────────────────────
// Cache Replicate output URLs in localStorage. Replicate CDN URLs last ≥24h.
// Key is a deterministic hash of the generation parameters.

const LS_KEY    = 'scaleai_asset_cache_v1';
const MAX_ITEMS = 60;
const TTL_MS    = 22 * 60 * 60 * 1000; // 22 hours (Replicate URLs expire ~24h)

interface Entry {
  url: string;
  ts:  number;
}

type Cache = Record<string, Entry>;

function load(): Cache {
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? '{}'); } catch { return {}; }
}

function save(cache: Cache): void {
  try { localStorage.setItem(LS_KEY, JSON.stringify(cache)); } catch { /* ignore */ }
}

function makeKey(parts: string[]): string {
  return parts.map(p => p.trim().toLowerCase()).join('|');
}

export function getCached(parts: string[]): string | null {
  const cache = load();
  const entry = cache[makeKey(parts)];
  if (!entry) return null;
  if (Date.now() - entry.ts > TTL_MS) return null;
  return entry.url;
}

export function setCache(parts: string[], url: string): void {
  const cache = load();
  const key   = makeKey(parts);
  cache[key]  = { url, ts: Date.now() };

  // Evict oldest if over limit
  const keys = Object.keys(cache);
  if (keys.length > MAX_ITEMS) {
    const oldest = keys.sort((a, b) => cache[a].ts - cache[b].ts)[0];
    delete cache[oldest];
  }
  save(cache);
}
