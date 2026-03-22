'use strict';
const { config }    = require('./config');
const cron          = require('node-cron');
const optimizer     = require('./engine/optimizer');
const guardrail     = require('./engine/guardrail');
const heartbeat     = require('./health/Heartbeat');
const alertManager  = require('./alerts/AlertManager');
const apiServer     = require('./api/server');
const { exportDailyCsv, getDailyStats }  = require('./reports/CsvExporter');
const { buildDailySummaryEmail }         = require('./alerts/AlertManager');
const { log }       = require('./logger');

const RUN_ONCE = process.argv.includes('--run-once');

// ─── Startup Banner ───────────────────────────────────────────────────────────
function printBanner() {
  console.log('\n' + '\u2550'.repeat(60));
  console.log('  ScaleAI \u2014 Automated Meta Ads Optimizer');
  console.log('\u2550'.repeat(60));
  console.log(`  Account    : ${config.META_AD_ACCOUNT_ID}`);
  console.log(`  Schedule   : ${config.CRON_SCHEDULE}`);
  console.log(`  Safety caps:`);
  console.log(`    \u2022 ${config.MAX_CHANGES_PER_DAY} changes/day per ad set`);
  console.log(`    \u2022 \u00b1${config.MAX_BUDGET_CHANGE_PCT}% cumulative per ad set/day`);
  console.log(`    \u2022 \u00b1${guardrail.MAX_TOTAL_BUDGET_CHANGE * 100}% aggregate account cap/day`);
  console.log(`    \u2022 ${guardrail.COOLDOWN_MINUTES}min cooldown per ad set`);
  console.log(`  Alerts     : min-level=${config.ALERT_MIN_LEVEL} | ` +
              `Webhook ${config.ALERT_WEBHOOK_URL ? '\u2713' : '\u2717 (not set)'} | ` +
              `Telegram ${config.TELEGRAM_BOT_TOKEN ? '\u2713' : '\u2717 (not set)'}`);
  console.log(`  Heartbeat  : every hour | critical after ${config.HEARTBEAT_FAIL_THRESHOLD}x failures`);
  console.log(`  CSV export : daily at 23:55`);
  console.log('\n  Per-tick execution flow:');
  console.log('   1. MockStore snapshot  \u2014 inventory \u2022 site health \u2022 drop-off rates');
  console.log('   2. Meta API fetch      \u2014 insights \u2022 active ad sets  [parallel]');
  console.log('   3. Site health gate    \u2014 BUG_DETECTED \u2192 panic rollback \u2192 pause all');
  console.log('   4. Decision loop       \u2014 correlate mock store + Meta performance');
  console.log('   5. Guardrail check     \u2014 caps + cooldown before any write');
  console.log('   6. Batch execute       \u2014 PAUSE first, then SCALE (5 concurrent)');
  console.log('   7. Run summary         \u2014 console + webhook + audit_log.json');
  console.log('\u2550'.repeat(60) + '\n');
}

// ─── Daily CSV Export + Email Template ───────────────────────────────────────

async function runDailyExport() {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const { path: csvPath, rowCount } = exportDailyCsv(today);
    log('INFO', 'DailyExport', { reason: `CSV written: ${csvPath} (${rowCount} rows)` });

    // ── Email summary template ───────────────────────────────────────────────
    // To send: add nodemailer to package.json and wire the transporter here.
    //
    //   const nodemailer = require('nodemailer');
    //   const transporter = nodemailer.createTransport({ host, port, auth: { user, pass } });
    //   const stats = getDailyStats(today);
    //   const html  = buildDailySummaryEmail(today, stats, []);
    //   await transporter.sendMail({ from, to: config.ALERT_EMAIL_TO,
    //     subject: `ScaleAI Daily Report \u2014 ${today}`, html });
    //
    if (config.ALERT_EMAIL_TO) {
      log('INFO', 'DailyExport', {
        reason: `Email template ready for ${config.ALERT_EMAIL_TO} \u2014 wire nodemailer to activate`,
      });
    }

    await alertManager.info(
      'Daily CSV Export Complete',
      `ScaleAI daily report for ${today} is ready.`,
      [
        { name: 'File',           value: csvPath         },
        { name: 'Actions logged', value: String(rowCount) },
      ]
    );
  } catch (err) {
    log('ERROR', 'DailyExport', { reason: err.message });
  }
}

// ─── RUN ONCE MODE ────────────────────────────────────────────────────────────

if (RUN_ONCE) {
  printBanner();

  optimizer.run()
    .then((stats) => {
      console.log('[ScaleAI] Run complete. Check audit_log.json for structured results.');
      if (stats.errors > 0) process.exit(1);
      process.exit(0);
    })
    .catch((err) => {
      console.error('[ScaleAI] Fatal error:', err.message);
      process.exit(1);
    });

} else {
  // ─── CRON SCHEDULER MODE ──────────────────────────────────────────────────
  if (!cron.validate(config.CRON_SCHEDULE)) {
    console.error(`[ScaleAI] Invalid CRON_SCHEDULE: "${config.CRON_SCHEDULE}"`);
    process.exit(1);
  }

  printBanner();

  // ── API server: start immediately so React can query /api/status ────────
  apiServer.start();

  console.log('[ScaleAI] Running immediately on start, then on schedule...\n');

  // ── Optimizer: run immediately, then on each tick ───────────────────────
  optimizer.run().catch(err => log('ERROR', 'System', { reason: err.message }));

  cron.schedule(config.CRON_SCHEDULE, () => {
    optimizer.run().catch(err => log('ERROR', 'System', { reason: err.message }));
  });

  // ── Heartbeat: run once immediately, then every hour ────────────────────
  heartbeat.tick().catch(err => log('ERROR', 'Heartbeat', { reason: err.message }));

  cron.schedule('0 * * * *', () => {
    heartbeat.tick().catch(err => log('ERROR', 'Heartbeat', { reason: err.message }));
  });

  // ── Daily CSV export: 23:55 every day ───────────────────────────────────
  cron.schedule('55 23 * * *', () => {
    runDailyExport().catch(err => log('ERROR', 'DailyExport', { reason: err.message }));
  });

  log('INFO', 'System', {
    reason: `Scheduler live \u2014 optimizer: ${config.CRON_SCHEDULE} | heartbeat: hourly | export: 23:55`,
  });
}
