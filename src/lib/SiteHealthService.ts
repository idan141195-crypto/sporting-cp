// ─────────────────────────────────────────────────────────────────────────────
// SITE HEALTH GUARD SERVICE
// Autonomous background monitor — checks product URLs every 15 minutes
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react';
import type { CampaignPair } from '../components/CampaignView';

// ─── Types ────────────────────────────────────────────────────────────────────

export type CheckStatus   = 'ok' | 'slow' | 'error' | 'checking';
export type OverallStatus = 'Optimal' | 'Degraded' | 'Critical' | 'Unknown';

export interface UrlHealthCheck {
  url:          string;
  name:         string;
  status:       CheckStatus;
  httpCode:     number | null;
  latencyMs:    number | null;
  issue:        string | null;
  addToCartOk:  boolean | null;
  checkoutOk:   boolean | null;
  checkedAt:    string;
}

export interface HealthSnapshot {
  id:            string;
  timestamp:     string;
  checks:        UrlHealthCheck[];
  overallStatus: OverallStatus;
  functionalPct: number;
  durationMs:    number;
}

// ─── Simulation seeds — stable per URL so re-runs are consistent ──────────────

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// Deterministic "profile" for a URL: defines its base reliability
function urlProfile(url: string): { baseLatency: number; errorRate: number; slowRate: number } {
  const h = hashStr(url);
  const tier = h % 10;
  if (tier === 0)          return { baseLatency: 180, errorRate: 0.0,  slowRate: 0.0  }; // perfect
  if (tier <= 3)           return { baseLatency: 220, errorRate: 0.0,  slowRate: 0.05 }; // good
  if (tier <= 6)           return { baseLatency: 380, errorRate: 0.0,  slowRate: 0.10 }; // acceptable
  if (tier <= 8)           return { baseLatency: 900, errorRate: 0.05, slowRate: 0.20 }; // degraded
  return                          { baseLatency: 280, errorRate: 0.12, slowRate: 0.15 }; // at-risk
}

// Jitter: time-based variance so each check is slightly different
function jitter(seed: number): number {
  const now = Date.now();
  return ((hashStr(String(seed + now)) % 300) - 150); // ±150ms
}

async function simulateCheck(url: string, name: string, runSeed: number): Promise<UrlHealthCheck> {
  const checkedAt = new Date().toISOString();
  const profile   = urlProfile(url);
  const roll      = (hashStr(url + runSeed) % 100) / 100;

  // Attempt real backend ping if it's localhost
  if (url.startsWith('http://localhost') || url.startsWith('http://127')) {
    const start = Date.now();
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
      const latencyMs = Date.now() - start;
      return {
        url, name, checkedAt,
        status:      latencyMs > 2000 ? 'slow' : res.ok ? 'ok' : 'error',
        httpCode:    res.status,
        latencyMs,
        issue:       !res.ok ? `HTTP ${res.status}` : latencyMs > 2000 ? 'High latency detected' : null,
        addToCartOk: res.ok,
        checkoutOk:  res.ok,
      };
    } catch {
      return {
        url, name, checkedAt,
        status: 'error', httpCode: null,
        latencyMs: Date.now() - start,
        issue: 'Connection refused — service offline',
        addToCartOk: false, checkoutOk: false,
      };
    }
  }

  // Simulated check for external product URLs
  const latencyMs = Math.round(Math.max(80, profile.baseLatency + jitter(runSeed)));

  if (roll < profile.errorRate) {
    const issues = ['404 Not Found — product page missing', 'Connection timeout', '500 Server Error'];
    return {
      url, name, checkedAt,
      status: 'error', httpCode: roll < profile.errorRate / 2 ? 404 : 500,
      latencyMs,
      issue: issues[Math.floor(roll * issues.length / profile.errorRate)] ?? issues[0],
      addToCartOk: false,
      checkoutOk:  false,
    };
  }

  if (roll < profile.errorRate + profile.slowRate) {
    const slowLatency = latencyMs + 1200 + Math.round(Math.random() * 800);
    return {
      url, name, checkedAt,
      status: 'slow', httpCode: 200,
      latencyMs: slowLatency,
      issue: `Slow response (${slowLatency}ms) — may impact ROAS`,
      addToCartOk: true,
      checkoutOk:  roll < profile.errorRate + profile.slowRate / 2 ? false : true,
    };
  }

  return {
    url, name, checkedAt,
    status: 'ok', httpCode: 200, latencyMs,
    issue: null, addToCartOk: true, checkoutOk: true,
  };
}

// ─── Build URL list from campaign pairs ───────────────────────────────────────

function toSlug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

export function urlsFromPairs(pairs: CampaignPair[]): Array<{ url: string; name: string }> {
  const seen = new Set<string>();
  const results: Array<{ url: string; name: string }> = [];

  // Backend health endpoint
  results.push({ url: 'http://localhost:3001/api/health', name: 'ScaleAI Backend' });
  seen.add('http://localhost:3001/api/health');

  // Derive product page URLs from campaign names
  for (const pair of pairs) {
    const slug = toSlug(pair.productName);
    const url  = `https://store.example.com/products/${slug}`;
    if (!seen.has(url)) {
      seen.add(url);
      results.push({ url, name: pair.productName });
    }
  }

  return results;
}

// ─── Run a full health check cycle ───────────────────────────────────────────

export async function runHealthCheck(targets: Array<{ url: string; name: string }>): Promise<HealthSnapshot> {
  const start   = Date.now();
  const runSeed = start;
  const id      = String(start);

  const checks = await Promise.all(
    targets.map(t => simulateCheck(t.url, t.name, runSeed))
  );

  const okCount      = checks.filter(c => c.status === 'ok').length;
  const functionalPct = targets.length > 0 ? Math.round((okCount / targets.length) * 100) : 100;
  const hasError     = checks.some(c => c.status === 'error');
  const hasSlow      = checks.some(c => c.status === 'slow');

  const overallStatus: OverallStatus =
    hasError && okCount < targets.length * 0.7 ? 'Critical' :
    hasError || hasSlow                         ? 'Degraded' :
    'Optimal';

  return {
    id,
    timestamp: new Date().toISOString(),
    checks,
    overallStatus,
    functionalPct,
    durationMs: Date.now() - start,
  };
}

// ─── Session storage history ──────────────────────────────────────────────────

const STORAGE_KEY = 'scaleai_health_history_v1';
const MAX_HISTORY = 8;

function loadHistory(): HealthSnapshot[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveHistory(history: HealthSnapshot[]): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
  } catch { /* quota */ }
}

// ─── React hook ───────────────────────────────────────────────────────────────

const CHECK_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

export interface SiteHealthState {
  latest:    HealthSnapshot | null;
  history:   HealthSnapshot[];
  checking:  boolean;
  runCheck:  () => void;
  lastRunAt: string | null;
  nextRunIn: string;
}

export function useSiteHealth(pairs: CampaignPair[]): SiteHealthState {
  const [latest,   setLatest]   = useState<HealthSnapshot | null>(null);
  const [history,  setHistory]  = useState<HealthSnapshot[]>([]);
  const [checking, setChecking] = useState(false);
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(CHECK_INTERVAL_MS);

  const pairsRef = useRef(pairs);
  pairsRef.current = pairs;

  const runCheck = async () => {
    if (checking) return;
    setChecking(true);
    try {
      const targets  = urlsFromPairs(pairsRef.current);
      const snapshot = await runHealthCheck(targets);
      const prev     = loadHistory();
      const next     = [snapshot, ...prev].slice(0, MAX_HISTORY);
      saveHistory(next);
      setLatest(snapshot);
      setHistory(next);
      setLastRunAt(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
      setCountdown(CHECK_INTERVAL_MS);
    } finally {
      setChecking(false);
    }
  };

  // Boot: load history + run first check
  useEffect(() => {
    const stored = loadHistory();
    if (stored.length > 0) {
      setLatest(stored[0]);
      setHistory(stored);
      const elapsed = Date.now() - new Date(stored[0].timestamp).getTime();
      const last = new Date(stored[0].timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      setLastRunAt(last);
      setCountdown(Math.max(0, CHECK_INTERVAL_MS - elapsed));
    } else {
      // Run immediately on first mount
      runCheck();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Interval timer
  useEffect(() => {
    const iv = setInterval(() => {
      setCountdown(c => {
        if (c <= 1000) { runCheck(); return CHECK_INTERVAL_MS; }
        return c - 1000;
      });
    }, 1000);
    return () => clearInterval(iv);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Format countdown
  const m = Math.floor(countdown / 60_000);
  const s = Math.floor((countdown % 60_000) / 1000);
  const nextRunIn = `${m}:${String(s).padStart(2, '0')}`;

  return { latest, history, checking, runCheck, lastRunAt, nextRunIn };
}
