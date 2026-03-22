'use strict';
const bizSdk = require('./client');
const { log } = require('../logger');
const { config } = require('../config');

// ─── Retry Policy per Meta error code ────────────────────────────────────────
//  Code  2  → Temporary service error          (retry up to 3×, base 2 s)
//  Code 17  → User/app request rate limit hit  (retry up to 4×, base 5 s)
//  Code 190 → OAuth token expired / invalid    (no retry — operator action needed)
const RETRY_POLICY = {
  2:   { name: 'TemporaryError',   maxRetries: 3, baseDelayMs: 2_000 },
  17:  { name: 'RateLimitError',   maxRetries: 4, baseDelayMs: 5_000 },
  190: { name: 'AuthExpiredError', maxRetries: 0, baseDelayMs: 0     },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extract Meta API error code from the SDK's thrown error.
 * The SDK wraps the Graph API response body in the error object.
 *
 * @param {Error} err
 * @returns {number|null}
 */
function extractMetaErrorCode(err) {
  // SDK puts the parsed body at err.response.error or err.error
  const body = err.response || err;
  const code  = body?.error?.code ?? body?.code ?? null;
  return code ? Number(code) : null;
}

/**
 * Exponential backoff with full-jitter:
 *   delay = baseDelay * 2^attempt + random(0, baseDelay)
 * Caps at 60 seconds to prevent indefinite stalls.
 *
 * @param {number} baseDelayMs
 * @param {number} attempt  0-indexed retry count
 * @returns {Promise<void>}
 */
function backoff(baseDelayMs, attempt) {
  const exp    = Math.pow(2, attempt);
  const jitter = Math.random() * baseDelayMs;
  const delay  = Math.min(baseDelayMs * exp + jitter, 60_000);
  log('INFO', 'MetaAdsManager', { reason: `Backoff ${attempt + 1}: waiting ${(delay / 1000).toFixed(1)}s before retry` });
  return new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * Execute a single Meta API call with automatic retry for recoverable errors.
 *
 * @param {string}   label     Human-readable name for logging (e.g. ad set name)
 * @param {Function} fn        Async function that performs the API call
 * @returns {Promise<any>}     Resolves with the API result or throws after exhausting retries
 */
async function withRetry(label, fn) {
  let attempt = 0;

  while (true) {
    try {
      return await fn();

    } catch (err) {
      const code   = extractMetaErrorCode(err);
      const policy = RETRY_POLICY[code];

      // ── Auth expired: fail immediately, no retry possible ─────────────────
      if (code === 190) {
        throw Object.assign(
          new Error(`[AuthExpired] Meta access token is expired or invalid. Renew META_ACCESS_TOKEN. (${err.message})`),
          { metaCode: 190, retryable: false }
        );
      }

      // ── Retryable error with budget remaining ─────────────────────────────
      if (policy && attempt < policy.maxRetries) {
        log('BLOCK', label, {
          reason: `Meta error ${code} (${policy.name}), attempt ${attempt + 1}/${policy.maxRetries} — retrying`,
        });
        await backoff(policy.baseDelayMs, attempt);
        attempt++;
        continue;
      }

      // ── Non-retryable or exhausted retries ────────────────────────────────
      const codeStr = code ? ` [code ${code}]` : '';
      throw Object.assign(
        new Error(`Meta API call failed after ${attempt} attempt(s)${codeStr}: ${err.message}`),
        { metaCode: code, retryable: false }
      );
    }
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetch the current live daily_budget for a single ad set from Meta.
 * Used for "sync-before-scale" verification.
 *
 * @param {string} adSetId
 * @returns {Promise<number>} Current daily budget in cents
 */
async function syncBudget(adSetId) {
  if (config.DEMO_MODE) return 5000; // demo: return a fixed value
  return withRetry(`adset:${adSetId}`, async () => {
    const AdSet = bizSdk.AdSet;
    const adSet = new AdSet(adSetId);
    const result = await adSet.get(['id', 'daily_budget']);
    const data   = result._data || result;
    return parseInt(data.daily_budget || 0, 10);
  });
}

/**
 * Update the daily budget for an ad set (with retry).
 * Optionally verifies the current budget matches `expectedCents` before applying.
 * If they differ, logs a Sync Warning and uses the live Meta value as baseline.
 *
 * @param {string} adSetId
 * @param {number} newBudgetCents     Target budget in minor currency units
 * @param {number} [expectedCents]    What we believe the current budget is (optional sync check)
 * @returns {Promise<number>}         The actual new budget that was applied
 */
async function updateBudget(adSetId, newBudgetCents, expectedCents) {
  if (config.DEMO_MODE) { log('SCALE', `adset:${adSetId}`, { reason: `[DEMO] Simulated budget update → $${(newBudgetCents/100).toFixed(2)} — no Meta API call made` }); return newBudgetCents; }
  // ── Sync verification: fetch live value if caller provided an expectation ──
  if (expectedCents !== undefined) {
    const liveCents = await syncBudget(adSetId);

    if (liveCents !== expectedCents) {
      log('BLOCK', `adset:${adSetId}`, {
        reason: `Sync Warning — local baseline $${(expectedCents / 100).toFixed(2)} ≠ Meta live $${(liveCents / 100).toFixed(2)} — using Meta value for +15% calculation`,
      });
      // Recalculate budget from the authoritative live value
      newBudgetCents = Math.round(liveCents * (newBudgetCents / expectedCents));
    }
  }

  await withRetry(`adset:${adSetId}`, async () => {
    const AdSet = bizSdk.AdSet;
    const adSet = new AdSet(adSetId);
    await adSet.update([], { daily_budget: Math.round(newBudgetCents) });
  });

  return newBudgetCents;
}

/**
 * Pause an ad set (with retry).
 *
 * @param {string} adSetId
 */
async function pauseAdSet(adSetId) {
  if (config.DEMO_MODE) { log('PAUSE', `adset:${adSetId}`, { reason: '[DEMO] Simulated pause — no Meta API call made' }); return; }
  return withRetry(`adset:${adSetId}`, async () => {
    const AdSet = bizSdk.AdSet;
    const adSet = new AdSet(adSetId);
    await adSet.update([], { status: AdSet.Status.paused });
  });
}

/**
 * Resume a paused ad set (with retry).
 *
 * @param {string} adSetId
 */
async function resumeAdSet(adSetId) {
  if (config.DEMO_MODE) { log('RESUME', `adset:${adSetId}`, { reason: '[DEMO] Simulated resume — no Meta API call made' }); return; }
  return withRetry(`adset:${adSetId}`, async () => {
    const AdSet = bizSdk.AdSet;
    const adSet = new AdSet(adSetId);
    await adSet.update([], { status: AdSet.Status.active });
  });
}

// ─── Batch Execution ──────────────────────────────────────────────────────────

/**
 * Execute a list of async operations in controlled batches.
 * Instead of running one-by-one (slow) or all-at-once (hammers rate limits),
 * this runs `batchSize` operations in parallel, waits for the batch to settle,
 * then starts the next batch.
 *
 * Each operation is an object: { label, fn, onSuccess, onError }
 *  - label:     string used in logs
 *  - fn:        async () => result
 *  - onSuccess: (result) => void  — called if fn resolves
 *  - onError:   (err)    => void  — called if fn rejects after all retries
 *
 * @param {Array<{label: string, fn: Function, onSuccess?: Function, onError?: Function}>} operations
 * @param {number} [batchSize=5]   Max concurrent Meta API calls per batch
 * @param {number} [batchDelayMs=300]  Pause between batches (rate limit buffer)
 */
async function batchExecute(operations, batchSize = 5, batchDelayMs = 300) {
  if (operations.length === 0) return;

  log('INFO', 'Batch', {
    reason: `Executing ${operations.length} operation(s) in batches of ${batchSize}`,
  });

  for (let i = 0; i < operations.length; i += batchSize) {
    const batch = operations.slice(i, i + batchSize);

    const batchNum = Math.floor(i / batchSize) + 1;
    const total    = Math.ceil(operations.length / batchSize);
    log('INFO', 'Batch', { reason: `Batch ${batchNum}/${total}: processing ${batch.length} item(s)` });

    // Run this batch in parallel — collect results without throwing
    await Promise.allSettled(
      batch.map(async (op) => {
        try {
          const result = await withRetry(op.label, op.fn);
          if (op.onSuccess) op.onSuccess(result);
        } catch (err) {
          if (op.onError) op.onError(err);
          else log('ERROR', op.label, { reason: err.message });
        }
      })
    );

    // Brief pause between batches to respect Meta's rate limit window
    if (i + batchSize < operations.length) {
      await new Promise(resolve => setTimeout(resolve, batchDelayMs));
    }
  }
}

module.exports = { syncBudget, updateBudget, pauseAdSet, resumeAdSet, batchExecute };
