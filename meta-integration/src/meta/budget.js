'use strict';
const bizSdk = require('./client');

/**
 * Update the daily budget for an ad set.
 * @param {string} adSetId
 * @param {number} newBudgetCents - budget in minor currency units (e.g. 5000 = $50.00)
 */
async function updateBudget(adSetId, newBudgetCents) {
  const AdSet = bizSdk.AdSet;
  const adSet = new AdSet(adSetId);
  await adSet.update([], { daily_budget: Math.round(newBudgetCents) });
}

/**
 * Pause an ad set immediately.
 * @param {string} adSetId
 */
async function pauseAdSet(adSetId) {
  const AdSet = bizSdk.AdSet;
  const adSet = new AdSet(adSetId);
  await adSet.update([], { status: AdSet.Status.paused });
}

/**
 * Resume a paused ad set.
 * @param {string} adSetId
 */
async function resumeAdSet(adSetId) {
  const AdSet = bizSdk.AdSet;
  const adSet = new AdSet(adSetId);
  await adSet.update([], { status: AdSet.Status.active });
}

module.exports = { updateBudget, pauseAdSet, resumeAdSet };
