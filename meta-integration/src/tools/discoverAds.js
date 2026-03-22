'use strict';
/**
 * ScaleAI — Meta Ad Set Discovery & Mapping Tool
 *
 * Usage:
 *   node src/tools/discoverAds.js
 *   node src/tools/discoverAds.js --all    (include PAUSED/ARCHIVED ad sets)
 *
 * What it does:
 *   1. Connects to the Meta Graph API using your .env credentials
 *   2. Fetches all ad sets in the account and prints a numbered list
 *   3. Walks through each Budo product and asks which ad set to map it to
 *   4. Writes the mapping into src/config/productMapping.json
 *
 * After running this, restart the engine + API server for changes to take effect.
 */

const path     = require('path');
const fs       = require('fs');
const readline = require('readline');

// ─── Load .env from the project root ─────────────────────────────────────────
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

const MAPPING_FILE = path.resolve(__dirname, '../config/productMapping.json');
const SHOW_ALL     = process.argv.includes('--all');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Right-pad a string to a fixed width */
const pad = (str, len) => String(str).padEnd(len).slice(0, len);

/** Format cents → "$X.XX" */
const usd = (cents) => cents ? `$${(parseInt(cents, 10) / 100).toFixed(2)}` : 'N/A';

/** Wrap readline.question in a Promise */
const ask = (rl, question) => new Promise(resolve => rl.question(question, resolve));

// ─── Status badge ─────────────────────────────────────────────────────────────
const STATUS_COLOR = {
  ACTIVE:   '\x1b[32m', // green
  PAUSED:   '\x1b[33m', // yellow
  ARCHIVED: '\x1b[90m', // gray
  DELETED:  '\x1b[31m', // red
};
const RESET = '\x1b[0m';
const BOLD  = '\x1b[1m';
const DIM   = '\x1b[2m';
const CYAN  = '\x1b[36m';
const GREEN = '\x1b[32m';
const RED   = '\x1b[31m';

function colorStatus(status) {
  const c = STATUS_COLOR[status] ?? '\x1b[90m';
  return `${c}${status}${RESET}`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}`);
  console.log(`${BOLD}${CYAN}  ScaleAI  ·  Meta Ad Set Discovery Tool${RESET}`);
  console.log(`${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}\n`);

  console.log(`${DIM}  Account  : ${accountId}${RESET}`);
  console.log(`${DIM}  Token    : ${token.slice(0, 12)}…${RESET}`);
  console.log(`${DIM}  Mode     : ${SHOW_ALL ? 'All ad sets' : 'Active only (use --all to see paused)'}${RESET}\n`);

  // ── Connect to Meta SDK ──────────────────────────────────────────────────
  let bizSdk;
  try {
    bizSdk = require('facebook-nodejs-business-sdk');
  } catch {
    console.error(`${RED}❌  facebook-nodejs-business-sdk not installed.${RESET}`);
    console.error(`    Run: npm install   (from the meta-integration folder)\n`);
    process.exit(1);
  }

  bizSdk.FacebookAdsApi.init(token);
  const AdAccount = bizSdk.AdAccount;

  // ── Fetch ad sets ────────────────────────────────────────────────────────
  console.log(`Fetching ad sets from Meta API…`);

  let adSets = [];
  try {
    const account  = new AdAccount(accountId);
    const response = await account.getAdSets(
      ['id', 'name', 'daily_budget', 'status', 'campaign_id'],
      { limit: 500 }
    );

    for (const row of response) {
      const d = row._data || row;
      if (!SHOW_ALL && d.status !== 'ACTIVE') continue;
      adSets.push({
        id:             d.id,
        name:           d.name,
        status:         d.status,
        dailyBudgetUsd: usd(d.daily_budget),
        campaignId:     d.campaign_id,
      });
    }
  } catch (err) {
    console.error(`\n${RED}❌  Meta API Error: ${err.message}${RESET}`);
    if (err.message?.includes('OAuthException') || err.message?.includes('190')) {
      console.error(`\n   Your access token may be expired or lack required permissions.`);
      console.error(`   Required permissions: ads_management, ads_read, business_management`);
      console.error(`   Regenerate at: https://developers.facebook.com/tools/explorer\n`);
    }
    process.exit(1);
  }

  if (adSets.length === 0) {
    console.log(`\n${RED}  No ad sets found.${RESET}`);
    console.log(`  ${DIM}(If you expected results, try running with --all to include non-active ad sets)${RESET}\n`);
    process.exit(0);
  }

  // ── Print ad set table ───────────────────────────────────────────────────
  console.log(`\n${BOLD}  Found ${adSets.length} ad set(s):${RESET}\n`);

  const SEP = `  ${'─'.repeat(72)}`;
  console.log(SEP);
  console.log(`  ${BOLD}${pad('#', 4)} ${pad('Status', 9)} ${pad('Budget/Day', 12)} ${pad('Ad Set Name', 36)} ID${RESET}`);
  console.log(SEP);

  adSets.forEach((a, i) => {
    const num    = pad(i + 1, 4);
    const status = pad(a.status, 9);
    const budget = pad(a.dailyBudgetUsd, 12);
    const name   = pad(a.name, 36);
    const c      = STATUS_COLOR[a.status] ?? '';
    console.log(`  ${BOLD}${num}${RESET} ${c}${status}${RESET} ${DIM}${budget}${RESET} ${name} ${DIM}${a.id}${RESET}`);
  });

  console.log(SEP);

  // ── Load current mapping ─────────────────────────────────────────────────
  if (!fs.existsSync(MAPPING_FILE)) {
    console.error(`\n${RED}❌  productMapping.json not found at:${RESET}`);
    console.error(`    ${MAPPING_FILE}\n`);
    process.exit(1);
  }

  const mapping = JSON.parse(fs.readFileSync(MAPPING_FILE, 'utf8'));

  // ── Interactive mapping session ──────────────────────────────────────────
  console.log(`\n${BOLD}  Now map each Budo product to a Meta Ad Set.${RESET}`);
  console.log(`  Enter the ${BOLD}#${RESET} from the list above, or press ${BOLD}Enter${RESET} to keep the current mapping.\n`);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const updated = [];
  let changes   = 0;

  for (const product of mapping.products) {
    const currentLabel = product.metaAdSetId
      ? `${DIM}current: "${product.metaAdSetName}" (${product.metaAdSetId})${RESET}`
      : `${DIM}(no current mapping)${RESET}`;

    const answer = await ask(
      rl,
      `  ${BOLD}[${product.productId}]${RESET} ${product.productName} → # ${currentLabel}: `
    );

    const trimmed = answer.trim();
    const idx     = parseInt(trimmed, 10) - 1;

    if (trimmed !== '' && !isNaN(idx) && idx >= 0 && idx < adSets.length) {
      const selected = adSets[idx];
      updated.push({ ...product, metaAdSetId: selected.id, metaAdSetName: selected.name });
      console.log(`  ${GREEN}✓${RESET}  Mapped → "${selected.name}" (${selected.id})\n`);
      changes++;
    } else {
      // Keep existing
      updated.push(product);
      if (trimmed === '') {
        console.log(`  ${DIM}  Kept existing mapping.${RESET}\n`);
      } else {
        console.log(`  ${DIM}  Invalid input — kept existing mapping.${RESET}\n`);
      }
    }
  }

  rl.close();

  if (changes === 0) {
    console.log(`\n${DIM}  No changes made. productMapping.json is unchanged.${RESET}\n`);
    process.exit(0);
  }

  // ── Write updated mapping ─────────────────────────────────────────────────
  const result = { ...mapping, products: updated };
  fs.writeFileSync(MAPPING_FILE, JSON.stringify(result, null, 2), 'utf8');

  // ── Final summary ─────────────────────────────────────────────────────────
  console.log(`${BOLD}${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}`);
  console.log(`${GREEN}  ✅  productMapping.json updated (${changes} change${changes !== 1 ? 's' : ''})${RESET}`);
  console.log(`${BOLD}${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}\n`);

  console.log(`  Updated mapping:\n`);
  for (const p of updated) {
    const label = p.metaAdSetId
      ? `${GREEN}${p.metaAdSetName}${RESET} ${DIM}(${p.metaAdSetId})${RESET}`
      : `${DIM}(unmapped)${RESET}`;
    console.log(`    [${p.productId}] ${pad(p.productName, 30)} → ${label}`);
  }

  console.log(`\n${DIM}  File: ${MAPPING_FILE}${RESET}\n`);
  console.log(`${BOLD}  Restart both processes to apply the new mapping:${RESET}\n`);
  console.log(`    ${CYAN}Terminal 1 (Engine):${RESET}  node src/index.js`);
  console.log(`    ${CYAN}Terminal 2 (API):   ${RESET}  node src/api/server.js\n`);
  console.log(`  The React frontend will automatically switch from DEMO → LIVE DATA.\n`);
}

main().catch(err => {
  console.error(`\n${RED}❌  Unexpected error: ${err.message}${RESET}`);
  if (process.env.DEBUG) console.error(err.stack);
  process.exit(1);
});
