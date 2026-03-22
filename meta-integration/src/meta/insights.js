'use strict';
const bizSdk = require('./client');
const { config } = require('../config');

// ─── Demo data (used when DEMO_MODE=true) ─────────────────────────────────────
const DEMO_INSIGHTS = [
  { adSetId: 'demo_001', adSetName: 'Summer Collection — Retargeting',   spend: 142.50, impressions: 18400, clicks: 312, cpc: 0.46, cpm: 7.75,  roas: 6.8 },
  { adSetId: 'demo_002', adSetName: 'Winter Sale — Prospecting UK',       spend:  89.20, impressions: 12100, clicks: 197, cpc: 0.45, cpm: 7.37,  roas: 2.1 },
  { adSetId: 'demo_003', adSetName: 'Sports Gear — Lookalike 5%',         spend: 215.00, impressions: 31200, clicks: 543, cpc: 0.40, cpm: 6.89,  roas: 5.4 },
  { adSetId: 'demo_004', adSetName: 'Premium Footwear — Broad Match',     spend:  63.00, impressions:  8700, clicks: 134, cpc: 0.47, cpm: 7.24,  roas: 3.9 },
  { adSetId: 'demo_005', adSetName: 'Accessories Bundle — Interest Stack', spend: 178.40, impressions: 24500, clicks: 420, cpc: 0.42, cpm: 7.28,  roas: 7.2 },
  { adSetId: 'demo_006', adSetName: 'Electronics — Dynamic Catalogue',    spend:  31.80, impressions:  4100, clicks:  62, cpc: 0.51, cpm: 7.76,  roas: 1.8 },
];

const FIELDS = [
  'adset_id',
  'adset_name',
  'spend',
  'impressions',
  'clicks',
  'cpc',
  'cpm',
  'purchase_roas',
];

/**
 * Fetch today's ad insights for all ad sets in the account.
 * @returns {Promise<Array<{adSetId, adSetName, spend, roas, cpc, cpm, impressions, clicks}>>}
 */
async function getInsights() {
  if (config.DEMO_MODE) return DEMO_INSIGHTS;

  const AdAccount = bizSdk.AdAccount;
  const account = new AdAccount(config.META_AD_ACCOUNT_ID);

  const response = await account.getInsights(FIELDS, {
    level: 'adset',
    date_preset: 'today',
    limit: 500,
  });

  const insights = [];
  for (const row of response) {
    const data = row._data || row;
    const roasArray = data.purchase_roas;
    const roas = roasArray && roasArray.length > 0
      ? parseFloat(roasArray[0].value)
      : 0;

    insights.push({
      adSetId:     data.adset_id,
      adSetName:   data.adset_name,
      spend:       parseFloat(data.spend       || 0),
      impressions: parseInt(data.impressions   || 0, 10),
      clicks:      parseInt(data.clicks        || 0, 10),
      cpc:         parseFloat(data.cpc         || 0),
      cpm:         parseFloat(data.cpm         || 0),
      roas,
    });
  }

  return insights;
}

module.exports = { getInsights };
