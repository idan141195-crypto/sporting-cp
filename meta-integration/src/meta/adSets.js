'use strict';
const bizSdk = require('./client');
const { config } = require('../config');

// ─── Demo data ─────────────────────────────────────────────────────────────────
const DEMO_AD_SETS = new Map([
  ['demo_001', { name: 'Summer Collection — Retargeting',    dailyBudgetCents: 5000,  status: 'ACTIVE' }],
  ['demo_002', { name: 'Winter Sale — Prospecting UK',       dailyBudgetCents: 3500,  status: 'ACTIVE' }],
  ['demo_003', { name: 'Sports Gear — Lookalike 5%',         dailyBudgetCents: 8000,  status: 'ACTIVE' }],
  ['demo_004', { name: 'Premium Footwear — Broad Match',     dailyBudgetCents: 2500,  status: 'ACTIVE' }],
  ['demo_005', { name: 'Accessories Bundle — Interest Stack', dailyBudgetCents: 7000,  status: 'ACTIVE' }],
  ['demo_006', { name: 'Electronics — Dynamic Catalogue',    dailyBudgetCents: 1200,  status: 'ACTIVE' }],
]);

/**
 * Fetch all ACTIVE ad sets for the account.
 * @returns {Promise<Map<string, {name, dailyBudgetCents, status}>>}
 */
async function getActiveAdSets() {
  if (config.DEMO_MODE) return new Map(DEMO_AD_SETS);

  const AdAccount = bizSdk.AdAccount;
  const account = new AdAccount(config.META_AD_ACCOUNT_ID);

  const response = await account.getAdSets(
    ['id', 'name', 'daily_budget', 'status'],
    { limit: 500 }
  );

  const map = new Map();
  for (const row of response) {
    const data = row._data || row;
    if (data.status !== 'ACTIVE' && data.status !== 'active') continue;
    map.set(data.id, {
      name:             data.name,
      dailyBudgetCents: parseInt(data.daily_budget || 0, 10),
      status:           data.status,
    });
  }

  return map;
}

module.exports = { getActiveAdSets };
