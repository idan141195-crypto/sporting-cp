'use strict';

/**
 * StateCache — in-memory singleton shared between the optimizer and the API server.
 *
 * The optimizer writes here after every run.
 * The API server reads from here on every request.
 *
 * This is safe because both run in the same Node.js process — Node's module cache
 * ensures they share the exact same object reference.
 */

const state = {
  lastRunAt:   null,     // ISO string
  runCount:    0,
  siteHealth:  'UNKNOWN',
  inventory:   {},       // mockProductKey → stock qty
  dropOffRates: {},      // stage → 'HIGH'|'LOW'

  // adSetId → { name, dailyBudgetCents, status }
  adSets: {},

  // adSetId → { roas, spend, impressions, clicks }
  insights: {},

  // adSetId → { action, reason, at }
  lastActions: {},
};

/**
 * Called by the optimizer after each run completes.
 *
 * @param {object} update
 * @param {object}            update.snap         MockStore snapshot
 * @param {Map}               update.adSets       id → { name, dailyBudgetCents, status }
 * @param {Array}             update.insights     array of insight rows
 * @param {object}            update.stats        run stats
 * @param {Map<string,object>} update.decisions   adSetId → { action, reason }
 */
function update({ snap, adSets, insights, stats, decisions }) {
  state.lastRunAt   = new Date().toISOString();
  state.runCount   += 1;

  if (snap) {
    state.siteHealth = snap.siteHealth?.status ?? 'UNKNOWN';
    state.inventory  = snap.inventory ? Object.fromEntries(snap.inventory) : {};
    state.dropOffRates = snap.dropOffRates ? Object.fromEntries(snap.dropOffRates) : {};
  }

  if (adSets) {
    for (const [id, data] of adSets) {
      state.adSets[id] = data;
    }
  }

  if (insights) {
    for (const row of insights) {
      state.insights[row.adSetId] = {
        roas:        row.roas,
        spend:       row.spend,
        impressions: row.impressions,
        clicks:      row.clicks,
      };
    }
  }

  if (decisions) {
    const now = new Date().toISOString();
    for (const [id, decision] of decisions) {
      if (decision.action !== 'HOLD') {
        state.lastActions[id] = {
          action: decision.action,
          reason: decision.reason,
          at:     now,
        };
      }
    }
  }
}

/**
 * Returns a clean snapshot of the current state (for JSON serialization).
 */
function getSnapshot() {
  return {
    lastRunAt:    state.lastRunAt,
    runCount:     state.runCount,
    siteHealth:   state.siteHealth,
    inventory:    state.inventory,
    dropOffRates: state.dropOffRates,
    adSets:       state.adSets,
    insights:     state.insights,
    lastActions:  state.lastActions,
  };
}

module.exports = { update, getSnapshot };
