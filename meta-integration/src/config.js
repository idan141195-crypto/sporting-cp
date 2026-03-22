'use strict';
require('dotenv').config();

const DEMO_MODE = !process.env.META_ACCESS_TOKEN || !process.env.META_AD_ACCOUNT_ID;

if (DEMO_MODE) {
  console.warn('[ScaleAI Config] ⚠  META_ACCESS_TOKEN / META_AD_ACCOUNT_ID not set — running in DEMO MODE (mock data only).');
}

const config = Object.freeze({
  DEMO_MODE,
  META_APP_ID:            process.env.META_APP_ID            || '',
  META_APP_SECRET:        process.env.META_APP_SECRET        || '',
  META_ACCESS_TOKEN:      process.env.META_ACCESS_TOKEN      || 'demo',
  META_AD_ACCOUNT_ID:     process.env.META_AD_ACCOUNT_ID     || 'act_demo',
  META_API_VERSION:       process.env.META_API_VERSION       || 'v20.0',

  INVENTORY_SOURCE:       process.env.INVENTORY_SOURCE       || 'csv',
  SHOPIFY_STORE_URL:      process.env.SHOPIFY_STORE_URL      || '',
  SHOPIFY_ACCESS_TOKEN:   process.env.SHOPIFY_ACCESS_TOKEN   || '',
  INVENTORY_CSV_PATH:     process.env.INVENTORY_CSV_PATH     || './data/inventory.csv',

  SITE_HEALTH_URL:        process.env.SITE_HEALTH_URL        || '',

  CRON_SCHEDULE:          process.env.CRON_SCHEDULE          || '*/15 * * * *',
  MAX_BUDGET_CHANGE_PCT:  Number(process.env.MAX_BUDGET_CHANGE_PCT) || 30,
  MAX_CHANGES_PER_DAY:    Number(process.env.MAX_CHANGES_PER_DAY)   || 5,

  // ─── Budget Caps ────────────────────────────────────────────────────────────
  GLOBAL_DAILY_MAX:         Number(process.env.GLOBAL_DAILY_MAX)          || 0,   // USD; 0 = disabled
  MIN_SCALE_INTERVAL_HOURS: Number(process.env.MIN_SCALE_INTERVAL_HOURS)  || 24,  // hours

  // ─── Alerting ──────────────────────────────────────────────────────────────
  ALERT_WEBHOOK_URL:      process.env.ALERT_WEBHOOK_URL      || '',   // Slack / Discord / generic
  TELEGRAM_BOT_TOKEN:     process.env.TELEGRAM_BOT_TOKEN     || '',
  TELEGRAM_CHAT_ID:       process.env.TELEGRAM_CHAT_ID       || '',
  ALERT_EMAIL_TO:         process.env.ALERT_EMAIL_TO         || '',   // placeholder — wire nodemailer
  ALERT_MIN_LEVEL:        process.env.ALERT_MIN_LEVEL        || 'WARNING', // INFO | WARNING | CRITICAL

  // ─── Heartbeat ─────────────────────────────────────────────────────────────
  HEARTBEAT_FAIL_THRESHOLD: Number(process.env.HEARTBEAT_FAIL_THRESHOLD) || 3,
});

module.exports = { config };
