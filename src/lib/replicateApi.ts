// ─── Replicate API Client ─────────────────────────────────────────────────
// Browser-safe REST client. Uses the "deployments" API (no version hash needed).
// Polls every 7-10s — not every 1s — to minimize API overhead.

// In dev we route through Vite's dev-server proxy to avoid CORS preflight issues.
// In production (GitHub Pages) we call Replicate directly — no proxy available.
const BASE = import.meta.env.DEV
  ? '/api/replicate'
  : 'https://api.replicate.com/v1';

export type ReplicateStatus = 'queued' | 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';

export interface Prediction {
  id:     string;
  status: ReplicateStatus;
  output: string | string[] | null;
  error:  string | null;
}

// ─── Create a prediction via the model route (no version hash required) ──────

export async function createPrediction(
  token:   string,
  model:   string,          // e.g. 'black-forest-labs/flux-schnell'
  input:   Record<string, unknown>,
  signal?: AbortSignal,
): Promise<string> {
  const res = await fetch(`${BASE}/models/${model}/predictions`, {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${token}`,
      'Content-Type': 'application/json',
      // Prefer: wait=5 only in dev (via proxy) — triggers CORS preflight in production
      ...(import.meta.env.DEV ? { Prefer: 'wait=5' } : {}),
    },
    body:   JSON.stringify({ input }),
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Replicate ${res.status}: ${text}`);
  }

  const data: Prediction = await res.json();

  // If the model finished immediately (Prefer: wait), return output directly
  if (data.status === 'succeeded') {
    const out = data.output;
    return Array.isArray(out) ? out[0] : (out ?? '');
  }
  if (data.status === 'failed') {
    throw new Error(`Replicate failed: ${data.error ?? 'unknown'}`);
  }

  // Otherwise return ID for polling
  return `poll:${data.id}`;
}

// ─── Poll until succeeded ─────────────────────────────────────────────────────

export async function pollUntilDone(
  token:       string,
  predictionId: string,
  onStatus?:   (status: ReplicateStatus) => void,
  signal?:     AbortSignal,
  intervalMs = 7000,        // 7s default — efficient, not hammering
  maxWaitMs  = 600_000,     // 10-minute hard timeout
): Promise<string> {
  const deadline = Date.now() + maxWaitMs;

  while (true) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    if (Date.now() > deadline) throw new Error('Video generation timed out after 10 minutes. Please try again.');

    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(resolve, intervalMs);
      signal?.addEventListener('abort', () => { clearTimeout(t); reject(new DOMException('Aborted', 'AbortError')); }, { once: true });
    });

    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    if (Date.now() > deadline) throw new Error('Video generation timed out after 10 minutes. Please try again.');

    const res = await fetch(`${BASE}/predictions/${predictionId}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal,
    });

    if (!res.ok) throw new Error(`Poll ${res.status}: ${await res.text().catch(() => '')}`);

    const data: Prediction = await res.json();
    onStatus?.(data.status);

    if (data.status === 'succeeded') {
      const out = data.output;
      return Array.isArray(out) ? out[0] : (out ?? '');
    }
    if (data.status === 'failed' || data.status === 'canceled') {
      throw new Error(`Prediction ${data.status}: ${data.error ?? ''}`);
    }
    // 'queued' | 'starting' | 'processing' → keep polling
  }
}

// ─── High-level helper: generate → auto-poll if needed ───────────────────────

export async function generate(
  token:       string,
  model:       string,
  input:       Record<string, unknown>,
  onStatus?:   (s: ReplicateStatus | 'requesting') => void,
  signal?:     AbortSignal,
  pollMs?:     number,
): Promise<string> {
  onStatus?.('requesting');
  const result = await createPrediction(token, model, input, signal);

  if (!result.startsWith('poll:')) return result;   // finished immediately

  const id = result.slice(5);
  onStatus?.('processing');
  return pollUntilDone(token, id, onStatus, signal, pollMs);
}
