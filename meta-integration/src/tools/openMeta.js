'use strict';
/**
 * ScaleAI — Open Meta Business Manager in Browser
 *
 * Usage:
 *   node src/tools/openMeta.js              → opens the Ad Account campaigns view
 *   node src/tools/openMeta.js --adsets     → opens the Ad Sets view
 *   node src/tools/openMeta.js --campaign   → opens the ScaleAI Test Campaign specifically
 *   node src/tools/openMeta.js --dashboard  → opens the main Meta Business Manager home
 */

const path    = require('path');
const fs      = require('fs');
const { exec } = require('child_process');

// ─── Load .env ─────────────────────────────────────────────────────────────────
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const accountId = process.env.META_AD_ACCOUNT_ID ?? '';
const accountNum = accountId.replace('act_', '');

// ─── ANSI ──────────────────────────────────────────────────────────────────────
const BOLD  = '\x1b[1m';
const CYAN  = '\x1b[36m';
const GREEN = '\x1b[32m';
const DIM   = '\x1b[2m';
const RESET = '\x1b[0m';

// ─── URL builder ───────────────────────────────────────────────────────────────
const URLS = {
  campaigns: accountNum
    ? `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${accountNum}`
    : `https://adsmanager.facebook.com`,
  adsets: accountNum
    ? `https://adsmanager.facebook.com/adsmanager/manage/adsets?act=${accountNum}`
    : `https://adsmanager.facebook.com`,
  reports: accountNum
    ? `https://adsmanager.facebook.com/adsmanager/reporting/manage?act=${accountNum}`
    : `https://adsmanager.facebook.com`,
  dashboard: `https://business.facebook.com`,
};

// Pick URL from flag
let url  = URLS.campaigns;
let label = 'Campaigns';

if (process.argv.includes('--adsets'))   { url = URLS.adsets;    label = 'Ad Sets'; }
if (process.argv.includes('--reports'))  { url = URLS.reports;   label = 'Reports'; }
if (process.argv.includes('--dashboard')){ url = URLS.dashboard; label = 'Business Home'; }

// ── If --campaign flag, find the ScaleAI Test Campaign ad sets ─────────────────
if (process.argv.includes('--campaign')) {
  const MAPPING = path.resolve(__dirname, '../config/productMapping.json');
  if (fs.existsSync(MAPPING)) {
    const mapping = JSON.parse(fs.readFileSync(MAPPING, 'utf8'));
    const firstId = mapping.products?.[0]?.metaAdSetId;
    if (firstId && accountNum) {
      url   = `https://adsmanager.facebook.com/adsmanager/manage/adsets?act=${accountNum}&filter_set=HAS_ID_${firstId}`;
      label = 'ScaleAI Test Campaign Ad Sets';
    }
  }
}

// ─── Open command (cross-platform) ─────────────────────────────────────────────
function openUrl(target) {
  const cmd =
    process.platform === 'darwin' ? `open "${target}"` :
    process.platform === 'win32'  ? `start "" "${target}"` :
    `xdg-open "${target}"`;

  exec(cmd, (err) => {
    if (err) {
      console.error(`\n  Could not open browser automatically.`);
      console.error(`  Open this URL manually:\n`);
      console.error(`  ${CYAN}${target}${RESET}\n`);
    }
  });
}

// ─── Main ──────────────────────────────────────────────────────────────────────
console.log(`\n${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}`);
console.log(`${BOLD}${CYAN}  ScaleAI  ·  Opening Meta Business Manager${RESET}`);
console.log(`${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}\n`);

console.log(`  ${DIM}Account : ${accountId || '(not set in .env)'}${RESET}`);
console.log(`  ${DIM}View    : ${label}${RESET}`);
console.log(`  ${DIM}URL     : ${url}${RESET}\n`);

console.log(`  ${GREEN}Opening browser…${RESET}`);
openUrl(url);

console.log(`\n  ${DIM}Flags:${RESET}`);
console.log(`    ${CYAN}--adsets    ${RESET}  Ad Sets view`);
console.log(`    ${CYAN}--campaign  ${RESET}  ScaleAI Test Campaign ad sets`);
console.log(`    ${CYAN}--reports   ${RESET}  Reporting dashboard`);
console.log(`    ${CYAN}--dashboard ${RESET}  Meta Business home\n`);
