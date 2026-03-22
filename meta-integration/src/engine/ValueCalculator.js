'use strict';
const fs   = require('fs');
const path = require('path');
const { logAudit } = require('../logger');

const VALUE_FILE = path.resolve(__dirname, '../../state/value_saved.json');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function loadState() {
  if (!fs.existsSync(VALUE_FILE)) {
    return { totalWasteSavedCents: 0, pauses: {}, history: [] };
  }
  try {
    return JSON.parse(fs.readFileSync(VALUE_FILE, 'utf8'));
  } catch {
    return { totalWasteSavedCents: 0, pauses: {}, history: [] };
  }
}

function saveState(state) {
  fs.mkdirSync(path.dirname(VALUE_FILE), { recursive: true });
  fs.writeFileSync(VALUE_FILE, JSON.stringify(state, null, 2));
}

// ─── Formula ──────────────────────────────────────────────────────────────────

/**
 * Calculate estimated wasted spend saved during a pause.
 *
 * Formula: pauseDurationHours × (dailyBudgetCents / 24)
 *
 * @param {string} pausedAtISO   ISO timestamp when the pause started
 * @param {number} dailyBudgetCents
 * @returns {number}  Saved waste in cents
 */
function calculateWasteSaved(pausedAtISO, dailyBudgetCents) {
  const durationMs    = Date.now() - new Date(pausedAtISO).getTime();
  const durationHours = durationMs / 3_600_000;
  const hourlyCents   = dailyBudgetCents / 24;
  return Math.max(0, Math.round(durationHours * hourlyCents));
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Record the START of a safety pause.
 * Called immediately after ScaleAI successfully pauses an ad set for a safety reason.
 *
 * Only tracked for:
 *   'LOW_INVENTORY' — inventory critically low (< 2 units)
 *   'BUG_DETECTED'  — site health bug detected
 *
 * @param {string}      adSetId
 * @param {string}      adSetName
 * @param {string}      pauseReason   'LOW_INVENTORY' | 'BUG_DETECTED'
 * @param {number}      dailyBudgetCents  Budget at time of pause (for waste calculation)
 * @param {string|null} productKey    mockProductKey — used to look up inventory on resume
 */
function recordPauseStart(adSetId, adSetName, pauseReason, dailyBudgetCents, productKey) {
  const state = loadState();

  // Don't overwrite an existing active (un-resumed) pause for the same ad set
  if (state.pauses[adSetId] && !state.pauses[adSetId].resumedAt) return;

  state.pauses[adSetId] = {
    adSetName,
    pauseReason,
    productKey:       productKey ?? null,
    dailyBudgetCents: dailyBudgetCents || 0,
    pausedAt:         new Date().toISOString(),
    resumedAt:        null,
    wasteSavedCents:  null,
  };

  saveState(state);
}

/**
 * Record the END of a safety pause: calculate waste saved, update cumulative total.
 * Writes a structured RESUME + waste_saved entry to audit_log.json.
 *
 * @param {string} adSetId
 * @returns {number}  Waste saved (cents) — 0 if no active pause found
 */
function recordPauseEnd(adSetId) {
  const state  = loadState();
  const record = state.pauses[adSetId];

  if (!record || record.resumedAt) return 0;

  const wasteSavedCents = calculateWasteSaved(record.pausedAt, record.dailyBudgetCents);
  const durationMs      = Date.now() - new Date(record.pausedAt).getTime();
  const durationHours   = Math.round((durationMs / 3_600_000) * 10) / 10;

  record.resumedAt      = new Date().toISOString();
  record.wasteSavedCents = wasteSavedCents;

  state.totalWasteSavedCents = (state.totalWasteSavedCents || 0) + wasteSavedCents;

  // ── Append to history ────────────────────────────────────────────────────
  state.history = state.history || [];
  state.history.push({
    adSetId,
    adSetName:      record.adSetName,
    pauseReason:    record.pauseReason,
    pausedAt:       record.pausedAt,
    resumedAt:      record.resumedAt,
    durationHours,
    dailyBudgetUsd: record.dailyBudgetCents / 100,
    wasteSavedUsd:  wasteSavedCents / 100,
  });

  saveState(state);

  // ── Audit log entry ───────────────────────────────────────────────────────
  logAudit({
    timestamp:  new Date().toISOString(),
    action:     'RESUME',
    adSetName:  record.adSetName,
    reason:     `${record.pauseReason} resolved — ad set resumed after ${durationHours}h pause. ` +
                `Estimated waste saved: $${(wasteSavedCents / 100).toFixed(2)} ` +
                `(${durationHours}h × $${(record.dailyBudgetCents / 100 / 24).toFixed(2)}/hr).`,
    roas:       null,
    budgetFrom: null,
    budgetTo:   null,
    mockStore:  null,
    wasteSaved: {
      durationHours,
      dailyBudgetUsd: record.dailyBudgetCents / 100,
      wasteSavedUsd:  wasteSavedCents / 100,
      pauseReason:    record.pauseReason,
    },
  });

  return wasteSavedCents;
}

/**
 * Returns all currently-active (un-resumed) safety pauses.
 *
 * @returns {Map<string, object>}  adSetId → pause record
 */
function getActivePauses() {
  const state  = loadState();
  const result = new Map();
  for (const [adSetId, record] of Object.entries(state.pauses || {})) {
    if (!record.resumedAt) result.set(adSetId, record);
  }
  return result;
}

/**
 * Total cumulative waste saved across all pauses (in cents).
 */
function getTotalWasteSaved() {
  return loadState().totalWasteSavedCents || 0;
}

/**
 * Human-readable summary — printed at the start of each optimizer run.
 */
function getSummary() {
  const state   = loadState();
  const active  = Object.values(state.pauses || {}).filter(p => !p.resumedAt);
  const totalUsd = (state.totalWasteSavedCents || 0) / 100;

  const parts = [`Cumulative waste saved: $${totalUsd.toFixed(2)}`];

  if (active.length > 0) {
    const activeSummary = active
      .map(p => {
        const hrs = ((Date.now() - new Date(p.pausedAt).getTime()) / 3_600_000).toFixed(1);
        const est = calculateWasteSaved(p.pausedAt, p.dailyBudgetCents);
        return `"${p.adSetName}" (${p.pauseReason}, ${hrs}h, ~$${(est / 100).toFixed(2)} saved so far)`;
      })
      .join(', ');
    parts.push(`Active safety pauses: ${activeSummary}`);
  } else {
    parts.push('No active safety pauses');
  }

  return parts.join(' | ');
}

module.exports = {
  recordPauseStart,
  recordPauseEnd,
  getActivePauses,
  getTotalWasteSaved,
  calculateWasteSaved,
  getSummary,
};
