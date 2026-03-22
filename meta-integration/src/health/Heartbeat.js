'use strict';
const { config }    = require('../config');
const alertManager  = require('../alerts/AlertManager');
const { log }       = require('../logger');

// ─── In-memory failure counter ────────────────────────────────────────────────
// Resets to 0 on any successful heartbeat.
// Persisted only in process memory — intentionally resets on restart.
let consecutiveMetaFailures = 0;
let lastHeartbeatAt         = null;

// ─── Connectivity checks ──────────────────────────────────────────────────────

/**
 * Lightweight Meta API connectivity check.
 * Fetches the ad account's name field — minimal data, confirms auth + network.
 *
 * @returns {Promise<{ ok: boolean, latencyMs: number, detail?: string }>}
 */
async function checkMetaConnection() {
  // Import lazily to avoid circular-dependency issues at startup
  const bizSdk = require('../meta/client');
  const start  = Date.now();

  try {
    const AdAccount = bizSdk.AdAccount;
    const account   = new AdAccount(config.META_AD_ACCOUNT_ID);
    await account.get(['name', 'id']);
    return { ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    return { ok: false, latencyMs: Date.now() - start, detail: err.message };
  }
}

/**
 * Mock store connectivity check.
 * Since MockStoreService is in-process, this never fails — but we verify
 * that it returns a valid snapshot shape.
 *
 * @returns {{ ok: boolean, detail?: string }}
 */
function checkMockStoreConnection() {
  try {
    const mockStore = require('../data/MockStoreService');
    const snap      = mockStore.getSnapshot();

    const valid = snap
      && snap.inventory instanceof Map
      && snap.siteHealth?.status
      && snap.dropOffRates instanceof Map;

    return valid
      ? { ok: true }
      : { ok: false, detail: 'MockStore snapshot is malformed' };
  } catch (err) {
    return { ok: false, detail: err.message };
  }
}

// ─── Heartbeat Tick ───────────────────────────────────────────────────────────

/**
 * Run one heartbeat tick:
 *  1. Check MockStore (sync)
 *  2. Check Meta API  (async)
 *  3. Log result
 *  4. If Meta has failed HEARTBEAT_FAIL_THRESHOLD times in a row → CRITICAL alert
 *  5. Reset failure counter on success
 *
 * @returns {Promise<{ metaOk: boolean, storeOk: boolean }>}
 */
async function tick() {
  const storeCheck = checkMockStoreConnection();
  const metaCheck  = await checkMetaConnection();

  lastHeartbeatAt  = new Date().toISOString();

  if (metaCheck.ok) {
    consecutiveMetaFailures = 0;

    log('INFO', 'Heartbeat', {
      reason: `OK — Meta ${metaCheck.latencyMs}ms | MockStore ${storeCheck.ok ? 'OK' : 'FAIL: ' + storeCheck.detail}`,
    });

    // Recover alert if we just came back online
    if (consecutiveMetaFailures === 0 && !storeCheck.ok) {
      await alertManager.warning(
        'MockStore Connection Lost',
        `MockStore returned an invalid snapshot.\n${storeCheck.detail}`,
        [{ name: 'Time', value: lastHeartbeatAt }]
      );
    }
  } else {
    consecutiveMetaFailures++;

    log('ERROR', 'Heartbeat', {
      reason: `Meta API unreachable (failure ${consecutiveMetaFailures}/${config.HEARTBEAT_FAIL_THRESHOLD}) — ${metaCheck.detail}`,
    });

    if (consecutiveMetaFailures >= config.HEARTBEAT_FAIL_THRESHOLD) {
      await alertManager.critical(
        'Meta API — Connection Lost',
        `ScaleAI has been unable to reach the Meta Graph API for ${consecutiveMetaFailures} consecutive heartbeat checks. ` +
        `Automated budget changes are suspended until connectivity is restored.`,
        [
          { name: 'Consecutive Failures', value: String(consecutiveMetaFailures) },
          { name: 'Last Error',           value: metaCheck.detail ?? 'unknown' },
          { name: 'Account',             value: config.META_AD_ACCOUNT_ID },
          { name: 'Time',                value: lastHeartbeatAt },
        ]
      );
    }
  }

  if (!storeCheck.ok) {
    log('ERROR', 'Heartbeat', { reason: `MockStore: ${storeCheck.detail}` });
  }

  return { metaOk: metaCheck.ok, storeOk: storeCheck.ok };
}

/**
 * Returns the current heartbeat state (for status display in banner).
 */
function getStatus() {
  return {
    lastHeartbeatAt,
    consecutiveMetaFailures,
    healthy: consecutiveMetaFailures === 0,
  };
}

module.exports = { tick, getStatus };
