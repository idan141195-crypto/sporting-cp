'use strict';
const fs   = require('fs');
const path = require('path');

const ROLLBACK_FILE = path.resolve(__dirname, '../../state/rollback.json');

// ─── Helpers ──────────────────────────────────────────────────────────────────
function today() {
  return new Date().toISOString().slice(0, 10);
}

function loadState() {
  if (!fs.existsSync(ROLLBACK_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(ROLLBACK_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveState(state) {
  fs.mkdirSync(path.dirname(ROLLBACK_FILE), { recursive: true });
  fs.writeFileSync(ROLLBACK_FILE, JSON.stringify(state, null, 2));
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Snapshot an ad set's budget BEFORE a SCALE operation.
 * This is the restore point for any subsequent rollback.
 *
 * Only records if no un-rolled-back entry already exists for today.
 * (Prevents overwriting the true baseline on a second scale attempt.)
 *
 * @param {string} adSetId
 * @param {string} adSetName
 * @param {number} budgetCents  The live confirmed budget BEFORE the +15% scale
 */
function recordPreScale(adSetId, adSetName, budgetCents) {
  const state = loadState();
  const t     = today();

  // Preserve the oldest baseline — never overwrite with a later snapshot
  if (state[adSetId] && state[adSetId].date === t && !state[adSetId].rolledBack) {
    return; // already have today's un-rolled-back baseline — keep it
  }

  state[adSetId] = {
    date:               t,
    adSetName,
    preScaleBudgetCents: budgetCents,
    scaledAt:           new Date().toISOString(),
    rolledBack:         false,
  };

  saveState(state);
}

/**
 * Return all ad sets that were scaled today and have NOT yet been rolled back.
 * These are "panic targets" — if the site is now BUG_DETECTED, revert them.
 *
 * @returns {Array<{ adSetId: string, adSetName: string, preScaleBudgetCents: number, scaledAt: string }>}
 */
function getPanicTargets() {
  const state = loadState();
  const t     = today();

  return Object.entries(state)
    .filter(([, v]) => v.date === t && !v.rolledBack)
    .map(([adSetId, v]) => ({
      adSetId,
      adSetName:           v.adSetName,
      preScaleBudgetCents: v.preScaleBudgetCents,
      scaledAt:            v.scaledAt,
    }));
}

/**
 * Mark an ad set as successfully rolled back.
 * Prevents duplicate rollback attempts within the same day.
 *
 * @param {string} adSetId
 */
function markRolledBack(adSetId) {
  const state = loadState();
  if (state[adSetId]) {
    state[adSetId].rolledBack   = true;
    state[adSetId].rolledBackAt = new Date().toISOString();
    saveState(state);
  }
}

/**
 * Returns true if today already has an active (un-rolled-back) pre-scale record.
 * The optimizer can use this to skip re-recording on a second scale in the same day.
 *
 * @param {string} adSetId
 */
function hasActiveSnapshot(adSetId) {
  const state = loadState();
  const rec   = state[adSetId];
  return rec && rec.date === today() && !rec.rolledBack;
}

/**
 * Human-readable summary of rollback state (for logging).
 */
function getSummary() {
  const targets = getPanicTargets();
  if (targets.length === 0) return 'No pending rollback targets today.';
  return targets
    .map(t => `  ${t.adSetName}: pre-scale $${(t.preScaleBudgetCents / 100).toFixed(2)} (scaled at ${t.scaledAt})`)
    .join('\n');
}

module.exports = { recordPreScale, getPanicTargets, markRolledBack, hasActiveSnapshot, getSummary };
