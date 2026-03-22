'use strict';
/**
 * ScaleAI — Meta Test Campaign Setup
 *
 * Usage:
 *   node src/tools/setupTestCampaigns.js
 *
 * What it does:
 *   1. Connects to Meta Graph API using your .env credentials
 *   2. Creates (or reuses) a "ScaleAI Test Campaign" in your ad account
 *   3. Creates 4 Budo-branded ad sets with ~$50/day budgets (all PAUSED)
 *   4. Auto-updates src/config/productMapping.json with the real ad set IDs
 *
 * After running this, start the engine + API server to see live data:
 *   Terminal 1:  node src/index.js
 *   Terminal 2:  node src/api/server.js
 */

const path = require('path');
const fs   = require('fs');

// ─── Load .env ────────────────────────────────────────────────────────────────
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const token     = process.env.META_ACCESS_TOKEN;
const accountId = process.env.META_AD_ACCOUNT_ID;

if (!token || token === 'your_token_here') {
  console.error('\n❌  META_ACCESS_TOKEN is missing or not set in your .env file.');
  console.error('    Copy .env.example → .env and fill in your token.\n');
  process.exit(1);
}
if (!accountId || accountId === 'act_your_id_here') {
  console.error('\n❌  META_AD_ACCOUNT_ID is missing or not set in your .env file.');
  console.error('    It must start with "act_", e.g.: act_123456789\n');
  process.exit(1);
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MAPPING_FILE    = path.resolve(__dirname, '../config/productMapping.json');
const CAMPAIGN_NAME   = 'ScaleAI Test Campaign';
const DAILY_BUDGET    = 5000; // cents = $50.00/day

/** Ad sets to create — names must match productMapping.json metaAdSetName values */
const AD_SETS_TO_CREATE = [
  { name: 'Budo – Sports Gear Retargeting',        productId: 101 },
  { name: 'Budo – Summer Collection Prospecting',  productId: 102 },
  { name: 'Budo – Premium Products Retargeting',   productId: 103 },
  { name: 'Budo – Accessories Bundle',             productId: 104 },
];

// ─── ANSI helpers ─────────────────────────────────────────────────────────────
const RESET  = '\x1b[0m';
const BOLD   = '\x1b[1m';
const DIM    = '\x1b[2m';
const CYAN   = '\x1b[36m';
const GREEN  = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED    = '\x1b[31m';

const pad = (str, len) => String(str).padEnd(len).slice(0, len);

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}`);
  console.log(`${BOLD}${CYAN}  ScaleAI  ·  Meta Test Campaign Setup${RESET}`);
  console.log(`${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}\n`);

  console.log(`${DIM}  Account  : ${accountId}${RESET}`);
  console.log(`${DIM}  Token    : ${token.slice(0, 12)}…${RESET}\n`);

  // ── Load Meta SDK ────────────────────────────────────────────────────────
  let bizSdk;
  try {
    bizSdk = require('facebook-nodejs-business-sdk');
  } catch {
    console.error(`${RED}❌  facebook-nodejs-business-sdk not installed.${RESET}`);
    console.error(`    Run: npm install   (from the meta-integration folder)\n`);
    process.exit(1);
  }

  const { FacebookAdsApi, AdAccount, Campaign, AdSet } = bizSdk;
  FacebookAdsApi.init(token);

  const account = new AdAccount(accountId);

  // ── Step 1: Find or create the test campaign ─────────────────────────────
  console.log(`${BOLD}[1/3]${RESET} Looking for existing "${CAMPAIGN_NAME}"…`);

  let campaignId = null;

  try {
    const campaigns = await account.getCampaigns(
      ['id', 'name', 'status'],
      { limit: 100 }
    );

    for (const c of campaigns) {
      const d = c._data || c;
      if (d.name === CAMPAIGN_NAME) {
        campaignId = d.id;
        console.log(`      ${GREEN}✓${RESET}  Found existing campaign: ${DIM}${campaignId}${RESET}`);
        break;
      }
    }
  } catch (err) {
    handleApiError(err);
    process.exit(1);
  }

  if (!campaignId) {
    console.log(`      Creating new campaign…`);
    try {
      const result = await account.createCampaign([], {
        name:               CAMPAIGN_NAME,
        objective:          'OUTCOME_TRAFFIC',
        status:             'PAUSED',
        special_ad_categories: [],
      });
      campaignId = result.id || (result._data && result._data.id);
      console.log(`      ${GREEN}✓${RESET}  Created campaign: ${DIM}${campaignId}${RESET}`);
    } catch (err) {
      handleApiError(err);
      process.exit(1);
    }
  }

  // ── Step 2: Create ad sets ────────────────────────────────────────────────
  console.log(`\n${BOLD}[2/3]${RESET} Creating ${AD_SETS_TO_CREATE.length} ad sets…\n`);

  const createdAdSets = [];

  for (const spec of AD_SETS_TO_CREATE) {
    process.stdout.write(`      ${pad(spec.name, 45)} `);

    // Check if an ad set with this name already exists under the campaign
    let existing = null;
    try {
      const existing_sets = await account.getAdSets(
        ['id', 'name', 'status'],
        { filtering: JSON.stringify([{ field: 'name', operator: 'EQUAL', value: spec.name }]), limit: 10 }
      );
      for (const s of existing_sets) {
        const d = s._data || s;
        if (d.name === spec.name) { existing = d; break; }
      }
    } catch {
      // filtering might not be supported — skip existence check
    }

    if (existing) {
      console.log(`${YELLOW}↩ reused${RESET}  ${DIM}${existing.id}${RESET}`);
      createdAdSets.push({ ...spec, adSetId: existing.id });
      continue;
    }

    try {
      const result = await account.createAdSet([], {
        name:         spec.name,
        campaign_id:  campaignId,
        daily_budget: DAILY_BUDGET,
        status:       'PAUSED',
        billing_event:'IMPRESSIONS',
        optimization_goal: 'LINK_CLICKS',
        targeting: {
          geo_locations: { countries: ['US'] },
          age_min: 18,
          age_max: 65,
        },
        bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
      });

      const newId = result.id || (result._data && result._data.id);
      console.log(`${GREEN}✓ created${RESET}  ${DIM}${newId}${RESET}`);
      createdAdSets.push({ ...spec, adSetId: newId });
    } catch (err) {
      console.log(`${RED}✗ failed${RESET}`);
      console.error(`         ${RED}${err.message}${RESET}`);
      // Continue with remaining ad sets; leave productMapping entry unchanged
      createdAdSets.push({ ...spec, adSetId: null });
    }
  }

  // ── Step 3: Update productMapping.json ───────────────────────────────────
  console.log(`\n${BOLD}[3/3]${RESET} Updating productMapping.json…`);

  if (!fs.existsSync(MAPPING_FILE)) {
    console.error(`\n${RED}❌  productMapping.json not found at:${RESET}`);
    console.error(`    ${MAPPING_FILE}\n`);
    process.exit(1);
  }

  const mapping  = JSON.parse(fs.readFileSync(MAPPING_FILE, 'utf8'));
  let   changes  = 0;

  for (const created of createdAdSets) {
    if (!created.adSetId) continue;
    const product = mapping.products.find(p => p.productId === created.productId);
    if (!product) continue;

    const oldId = product.metaAdSetId;
    product.metaAdSetId   = created.adSetId;
    product.metaAdSetName = created.name;

    if (oldId !== created.adSetId) changes++;
  }

  fs.writeFileSync(MAPPING_FILE, JSON.stringify(mapping, null, 2), 'utf8');
  console.log(`      ${GREEN}✓${RESET}  ${changes} mapping(s) updated\n`);

  // ── Summary ───────────────────────────────────────────────────────────────
  const SEP = `  ${'─'.repeat(72)}`;
  console.log(`${BOLD}${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}`);
  console.log(`${GREEN}  ✅  Setup complete!${RESET}`);
  console.log(`${BOLD}${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}\n`);

  console.log(`  ${BOLD}Campaign:${RESET}  ${CAMPAIGN_NAME}  ${DIM}(${campaignId})${RESET}\n`);

  console.log(SEP);
  console.log(`  ${BOLD}${pad('#', 4)} ${pad('Ad Set Name', 45)} ${pad('Ad Set ID', 20)} Mapped Product${RESET}`);
  console.log(SEP);

  createdAdSets.forEach((s, i) => {
    const product  = mapping.products.find(p => p.productId === s.productId);
    const prodName = product ? product.productName : '—';
    const idStr    = s.adSetId ? s.adSetId : `${RED}FAILED${RESET}`;
    console.log(`  ${BOLD}${pad(i + 1, 4)}${RESET} ${pad(s.name, 45)} ${DIM}${pad(idStr, 20)}${RESET} ${prodName}`);
  });

  console.log(SEP);

  console.log(`\n  ${BOLD}Next steps:${RESET}\n`);
  console.log(`    ${CYAN}Terminal 1 (Engine):${RESET}  node src/index.js`);
  console.log(`    ${CYAN}Terminal 2 (API):   ${RESET}  node src/api/server.js`);
  console.log(`\n  The React dashboard will switch from DEMO → LIVE DATA automatically.`);
  console.log(`  All ad sets are PAUSED — activate them in Meta Ads Manager when ready.\n`);

  const accountNum = accountId.replace('act_', '');
  console.log(`  ${DIM}View campaign in Meta Ads Manager:${RESET}`);
  console.log(`  ${CYAN}https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${accountNum}${RESET}\n`);
}

// ─── Error handler ────────────────────────────────────────────────────────────

function handleApiError(err) {
  console.error(`\n${RED}❌  Meta API Error: ${err.message}${RESET}`);
  if (err.message?.includes('OAuthException') || err.message?.includes('190')) {
    console.error(`\n   Your access token may be expired or lack required permissions.`);
    console.error(`   Required: ads_management, ads_read, business_management`);
    console.error(`   Regenerate at: https://developers.facebook.com/tools/explorer\n`);
  }
  if (err.message?.includes('(#200)') || err.message?.includes('permission')) {
    console.error(`\n   Permission denied — make sure this token has "ads_management" scope`);
    console.error(`   and that the ad account belongs to your Business Manager.\n`);
  }
}

// ─── Run ──────────────────────────────────────────────────────────────────────

main().catch(err => {
  console.error(`\n${RED}❌  Unexpected error: ${err.message}${RESET}`);
  if (process.env.DEBUG) console.error(err.stack);
  process.exit(1);
});
