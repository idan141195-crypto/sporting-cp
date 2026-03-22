'use strict';
const fs   = require('fs');
const path = require('path');
const { config } = require('../config');

const STATE_FILE = path.resolve(__dirname, '../../state/guardrail.json');

// ─── Safety Constants ─────────────────────────────────────────────────────────
// Max cumulative % change across ALL ad sets combined in a 24-hour period.
// Prevents the engine from over-correcting the whole account budget in one day.
const MAX_TOTAL_BUDGET_CHANGE = 0.20; // 20 percentage-points aggregate account cap

// Minimum minutes between two changes to the same ad set.
const COOLDOWN_MINUTES = 60;

// Minimum hours between two SCALE actions on the same ad set.
// Protects Meta's learning phase — scaling too often resets the algorithm.
const MIN_SCALE_INTERVAL_HOURS = config.MIN_SCALE_INTERVAL_HOURS || 24;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function today() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function loadState() {
  if (!fs.existsSync(STATE_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveState(state) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

/**
 * Get or initialize today's per-ad-set record.
 * Automatically resets when the date rolls over.
 */
function getRecord(state, adSetId) {
  const t = today();
  if (!state[adSetId] || state[adSetId].date !== t) {
    // Preserve lastScaledAt across the midnight reset so the 24h learning-phase
    // window is enforced correctly even when the day rolls over.
    const prevLastScaledAt = state[adSetId]?.lastScaledAt ?? null;
    state[adSetId] = { date: t, changes: 0, totalDeltaPct: 0, lastChangedAt: null, lastScaledAt: prevLastScaledAt };
  }
  return state[adSetId];
}

/**
 * Get or initialize today's account-level aggregate record.
 */
function getAccountRecord(state) {
  const t = today();
  if (!state._account || state._account.date !== t) {
    state._account = { date: t, totalPctChanged: 0 };
  }
  return state._account;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Check whether a budget change is allowed for an ad set.
 *
 * Enforces three independent rules:
 *  1. Per-ad-set daily change count cap      (config.MAX_CHANGES_PER_DAY)
 *  2. Per-ad-set daily cumulative % cap      (config.MAX_BUDGET_CHANGE_PCT)
 *  3. Account-level aggregate daily % cap   (MAX_TOTAL_BUDGET_CHANGE = 20%)
 *  4. Per-ad-set 1-hour cooldown             (COOLDOWN_MINUTES = 60)
 *
 * @param {string} adSetId
 * @param {number} proposedPctChange  e.g. 15 for +15%  |  0 for a pause action
 * @returns {{ allowed: boolean, reason?: string }}
 */
function canChange(adSetId, proposedPctChange = 0) {
  const state   = loadState();
  const record  = getRecord(state, adSetId);
  const account = getAccountRecord(state);

  // ── Rule 1: per-ad-set daily change count ────────────────────────────────
  if (record.changes >= config.MAX_CHANGES_PER_DAY) {
    return {
      allowed: false,
      reason: `Daily change limit reached (${record.changes}/${config.MAX_CHANGES_PER_DAY} changes today)`,
    };
  }

  // ── Rule 2: per-ad-set cumulative % cap ──────────────────────────────────
  const newAdSetTotal = record.totalDeltaPct + Math.abs(proposedPctChange);
  if (newAdSetTotal > config.MAX_BUDGET_CHANGE_PCT) {
    return {
      allowed: false,
      reason: `Would exceed per-ad-set daily cap (${newAdSetTotal.toFixed(1)}% > ${config.MAX_BUDGET_CHANGE_PCT}%)`,
    };
  }

  // ── Rule 3: account-level aggregate daily % cap ──────────────────────────
  const newAccountTotal = account.totalPctChanged + Math.abs(proposedPctChange);
  const accountCapPct   = MAX_TOTAL_BUDGET_CHANGE * 100; // convert 0.20 → 20
  if (newAccountTotal > accountCapPct) {
    return {
      allowed: false,
      reason: `Would exceed account daily budget cap (${newAccountTotal.toFixed(1)}% > ${accountCapPct}% aggregate limit)`,
    };
  }

  // ── Rule 4: 1-hour cooldown per ad set ───────────────────────────────────
  if (record.lastChangedAt) {
    const msSinceLast   = Date.now() - new Date(record.lastChangedAt).getTime();
    const minsSinceLast = msSinceLast / 60_000;
    if (minsSinceLast < COOLDOWN_MINUTES) {
      const remaining = Math.ceil(COOLDOWN_MINUTES - minsSinceLast);
      return {
        allowed: false,
        reason: `Cooldown active — last change was ${Math.floor(minsSinceLast)}m ago (${remaining}m remaining)`,
      };
    }
  }

  // ── Rule 5: Learning phase — min 24h between SCALE actions ───────────────
  // Only applies to SCALE (pctChange > 0). PAUSE commands bypass this rule.
  if (proposedPctChange > 0 && record.lastScaledAt) {
    const hoursSinceScale = (Date.now() - new Date(record.lastScaledAt).getTime()) / 3_600_000;
    if (hoursSinceScale < MIN_SCALE_INTERVAL_HOURS) {
      const hoursRemaining = Math.ceil(MIN_SCALE_INTERVAL_HOURS - hoursSinceScale);
      return {
        allowed: false,
        reason: `Learning phase protection — last scale was ${hoursSinceScale.toFixed(1)}h ago (${hoursRemaining}h until next allowed scale — avoids resetting Meta's algorithm)`,
      };
    }
  }

  return { allowed: true };
}

/**
 * Record a completed change — updates both per-ad-set and account-level ledgers.
 *
 * @param {string} adSetId
 * @param {number} pctChange  absolute percentage changed (0 for pause actions)
 */
function recordChange(adSetId, pctChange = 0) {
  const state   = loadState();
  const record  = getRecord(state, adSetId);
  const account = getAccountRecord(state);

  record.changes        += 1;
  record.totalDeltaPct  += Math.abs(pctChange);
  record.lastChangedAt   = new Date().toISOString();

  // Track last SCALE timestamp separately for learning phase enforcement
  if (pctChange > 0) {
    record.lastScaledAt = new Date().toISOString();
  }

  account.totalPctChanged += Math.abs(pctChange);

  saveState(state);
}

/**
 * Check whether a SCALE action would push the total account daily budget over
 * the GLOBAL_DAILY_MAX limit (configured in .env).
 *
 * This is an absolute dollar-amount cap on the sum of all active ad set budgets.
 * Pass 0 or omit GLOBAL_DAILY_MAX in .env to disable this check.
 *
 * @param {number} currentTotalCents  Sum of ALL active ad set daily_budget values (cents)
 * @param {number} proposedAddCents   How many extra cents the scale action would add
 * @returns {{ allowed: boolean, reason?: string }}
 */
function checkGlobalCap(currentTotalCents, proposedAddCents) {
  const maxUsd = config.GLOBAL_DAILY_MAX || 0;
  if (maxUsd <= 0) return { allowed: true }; // cap disabled

  const maxCents  = maxUsd * 100;
  const newTotalCents = currentTotalCents + proposedAddCents;

  if (newTotalCents > maxCents) {
    return {
      allowed: false,
      reason: `Scale blocked: Global Budget Cap reached — ` +
              `$${(currentTotalCents / 100).toFixed(2)} current + $${(proposedAddCents / 100).toFixed(2)} proposed > $${maxUsd} daily max`,
    };
  }

  return { allowed: true };
}

/**
 * Returns a human-readable summary of today's guardrail state.
 * Used for logging at the start of each run.
 */
function getSummary() {
  const state   = loadState();
  const account = getAccountRecord(state);
  const t       = today();

  const adSetLines = Object.entries(state)
    .filter(([k, v]) => k !== '_account' && v.date === t)
    .map(([id, v]) => `  ${id}: ${v.changes} changes, ${v.totalDeltaPct.toFixed(1)}% total delta`)
    .join('\n');

  return [
    `Account aggregate today: ${account.totalPctChanged.toFixed(1)}% / ${MAX_TOTAL_BUDGET_CHANGE * 100}% cap`,
    adSetLines || '  (no ad sets changed today)',
  ].join('\n');
}

module.exports = { canChange, recordChange, checkGlobalCap, getSummary, MAX_TOTAL_BUDGET_CHANGE, COOLDOWN_MINUTES, MIN_SCALE_INTERVAL_HOURS };
