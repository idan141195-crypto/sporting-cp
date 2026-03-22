'use strict';
const axios  = require('axios');
const fs     = require('fs');
const path   = require('path');
const { config } = require('../config');

// ─── Alert Levels ─────────────────────────────────────────────────────────────
const LEVELS = { INFO: 0, WARNING: 1, CRITICAL: 2 };

const LEVEL_COLORS = {
  INFO:     '\x1b[36m',   // cyan
  WARNING:  '\x1b[33m',   // yellow
  CRITICAL: '\x1b[1;31m', // bold red
  RESET:    '\x1b[0m',
};

// Slack/Discord color sidebars (decimal)
const WEBHOOK_COLORS = { INFO: 3447003, WARNING: 16776960, CRITICAL: 15158332 };
// hex equivalents:         #3498DB blue  #FFFF00 yellow    #E74C3C red

// ─── Helpers ──────────────────────────────────────────────────────────────────
function now() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function minLevel() {
  return LEVELS[config.ALERT_MIN_LEVEL] ?? LEVELS.WARNING;
}

function shouldFire(level) {
  return (LEVELS[level] ?? 0) >= minLevel();
}

// ─── Console Alert ────────────────────────────────────────────────────────────

/**
 * Print a high-contrast, boxed alert to the console.
 *
 * @param {'INFO'|'WARNING'|'CRITICAL'} level
 * @param {string} title   Short event name, e.g. "PANIC ROLLBACK"
 * @param {string} body    Multi-line detail string
 */
function consoleAlert(level, title, body) {
  const color = LEVEL_COLORS[level] || LEVEL_COLORS.INFO;
  const reset = LEVEL_COLORS.RESET;
  const width = 64;
  const bar   = '█'.repeat(width);
  const pad   = (s) => ` ${s}`.padEnd(width - 1) + ' ';

  const lines = [
    bar,
    pad(`  🔔 ScaleAI Alert — ${level}`),
    pad(`  ${title}`),
    pad(''),
    ...body.split('\n').map(l => pad(`  ${l}`)),
    pad(''),
    pad(`  ${now()}`),
    bar,
  ];

  console.log(`\n${color}${lines.join('\n')}${reset}\n`);
}

// ─── Webhook (Slack / Discord / Telegram) ─────────────────────────────────────

/**
 * Build a Slack-compatible attachment payload.
 */
function buildSlackPayload(level, title, body, fields) {
  return {
    text: `*ScaleAI — ${level}: ${title}*`,
    attachments: [{
      color:  level === 'CRITICAL' ? 'danger' : level === 'WARNING' ? 'warning' : 'good',
      fields: fields.map(f => ({ title: f.name, value: f.value, short: true })),
      footer: `ScaleAI • ${now()}`,
      text:   body,
    }],
  };
}

/**
 * Build a Discord embed payload.
 */
function buildDiscordPayload(level, title, body, fields) {
  return {
    embeds: [{
      title:       `🔔 ScaleAI — ${title}`,
      description: body,
      color:       WEBHOOK_COLORS[level] ?? WEBHOOK_COLORS.INFO,
      fields:      fields.map(f => ({ name: f.name, value: String(f.value), inline: true })),
      footer:      { text: `ScaleAI ${level} • ${now()}` },
    }],
  };
}

/**
 * Build a Telegram sendMessage payload.
 * Uses HTML parse_mode for bold/code formatting.
 */
function buildTelegramPayload(level, title, body, fields) {
  const fieldLines = fields.map(f => `  <b>${f.name}:</b> ${f.value}`).join('\n');
  const text = [
    `🔔 <b>ScaleAI — ${level}</b>`,
    `<b>${title}</b>`,
    '',
    body,
    '',
    fieldLines,
    '',
    `<i>${now()}</i>`,
  ].filter(l => l !== null).join('\n');

  return {
    chat_id:    config.TELEGRAM_CHAT_ID,
    text,
    parse_mode: 'HTML',
  };
}

/**
 * Send a formatted message to the configured webhook.
 * Silently skips if no webhook is configured.
 *
 * Automatically detects webhook type from the URL:
 *   discord.com  → Discord embed format
 *   telegram     → Telegram Bot API
 *   (anything else) → Slack attachment format
 *
 * @param {'INFO'|'WARNING'|'CRITICAL'} level
 * @param {string} title
 * @param {string} body
 * @param {Array<{name: string, value: string}>} [fields=[]]
 */
async function sendWebhook(level, title, body, fields = []) {
  const webhookUrl = config.ALERT_WEBHOOK_URL;
  const tgToken    = config.TELEGRAM_BOT_TOKEN;
  const tgChatId   = config.TELEGRAM_CHAT_ID;

  const hasTelegram = tgToken && tgChatId;
  const hasWebhook  = webhookUrl;

  if (!hasWebhook && !hasTelegram) return; // not configured — skip silently

  try {
    if (hasWebhook) {
      const url     = webhookUrl.toLowerCase();
      const payload = url.includes('discord.com')
        ? buildDiscordPayload(level, title, body, fields)
        : buildSlackPayload(level, title, body, fields);

      await axios.post(webhookUrl, payload, { timeout: 10_000 });
    }

    if (hasTelegram) {
      const payload = buildTelegramPayload(level, title, body, fields);
      await axios.post(
        `https://api.telegram.org/bot${tgToken}/sendMessage`,
        payload,
        { timeout: 10_000 }
      );
    }
  } catch (err) {
    // Never let alerting failures crash the optimizer
    console.error(`[AlertManager] Webhook delivery failed: ${err.message}`);
  }
}

// ─── Email Summary Template ───────────────────────────────────────────────────

/**
 * Generate an HTML email template for the daily summary.
 * To actually send: wire the return value into nodemailer's `html` field.
 *
 * Example wiring (add nodemailer to package.json):
 *
 *   const nodemailer = require('nodemailer');
 *   const transporter = nodemailer.createTransport({ ... });
 *   await transporter.sendMail({
 *     from: 'scaleai@yourco.com',
 *     to:   config.ALERT_EMAIL_TO,
 *     subject: `ScaleAI Daily Report — ${date}`,
 *     html: buildDailySummaryEmail(date, stats, entries),
 *   });
 *
 * @param {string}   date    YYYY-MM-DD
 * @param {object}   stats   { scaled, paused, held, blocked, errors, totalBudgetChangePct }
 * @param {Array}    entries Audit log entries for the day
 * @returns {string} HTML string
 */
function buildDailySummaryEmail(date, stats, entries) {
  const rows = entries.map(e => `
    <tr>
      <td>${e.timestamp?.slice(0, 19) ?? ''}</td>
      <td><b style="color:${e.action==='SCALE'?'#27ae60':e.action==='PAUSE'?'#e74c3c':'#7f8c8d'}">${e.action}</b></td>
      <td>${e.adSetName ?? ''}</td>
      <td>${e.roas != null ? e.roas.toFixed(2) : '—'}</td>
      <td>${e.budgetFrom != null ? '$'+(e.budgetFrom/100).toFixed(2) : '—'}</td>
      <td>${e.budgetTo   != null ? '$'+(e.budgetTo/100).toFixed(2)   : '—'}</td>
      <td style="font-size:12px;color:#555">${e.reason ?? ''}</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  body { font-family: Arial, sans-serif; color: #333; max-width: 900px; margin: 40px auto; }
  h1   { color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 8px; }
  .kpi { display: flex; gap: 16px; margin: 20px 0; }
  .kpi-card { background: #f8f9fa; border-left: 4px solid #3498db; padding: 12px 20px; border-radius: 4px; flex: 1; }
  .kpi-card h3 { margin: 0; font-size: 28px; }
  .kpi-card p  { margin: 4px 0 0; color: #666; font-size: 13px; }
  table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 13px; }
  th { background: #2c3e50; color: white; padding: 10px; text-align: left; }
  td { padding: 8px 10px; border-bottom: 1px solid #eee; }
  tr:hover td { background: #f5f5f5; }
  .footer { margin-top: 30px; color: #999; font-size: 12px; }
</style></head>
<body>
  <h1>📊 ScaleAI Daily Report — ${date}</h1>
  <div class="kpi">
    <div class="kpi-card" style="border-color:#27ae60"><h3>${stats.scaled}</h3><p>Ad Sets Scaled</p></div>
    <div class="kpi-card" style="border-color:#e74c3c"><h3>${stats.paused}</h3><p>Ad Sets Paused</p></div>
    <div class="kpi-card" style="border-color:#f39c12"><h3>${stats.blocked}</h3><p>Guardrail Blocks</p></div>
    <div class="kpi-card" style="border-color:#3498db"><h3>${(stats.totalBudgetChangePct||0).toFixed(1)}%</h3><p>Total Budget Δ</p></div>
    <div class="kpi-card" style="border-color:${stats.errors>0?'#e74c3c':'#27ae60'}"><h3>${stats.errors}</h3><p>API Errors</p></div>
  </div>
  <table>
    <tr><th>Time</th><th>Action</th><th>Ad Set</th><th>ROAS</th><th>Budget From</th><th>Budget To</th><th>Reason</th></tr>
    ${rows || '<tr><td colspan="7" style="text-align:center;color:#999">No actions recorded today.</td></tr>'}
  </table>
  <p class="footer">Generated by ScaleAI Optimizer • ${new Date().toISOString()}<br>
  Account: ${config.META_AD_ACCOUNT_ID}</p>
</body></html>`;
}

// ─── Primary Alert Entry Point ────────────────────────────────────────────────

/**
 * Fire an alert through all configured channels.
 *
 * @param {'INFO'|'WARNING'|'CRITICAL'} level
 * @param {string} title   Short event name
 * @param {string} body    Detail paragraph
 * @param {Array<{name:string, value:string}>} [fields=[]]  Key-value pairs for webhook cards
 */
async function alert(level, title, body, fields = []) {
  consoleAlert(level, title, body);
  if (shouldFire(level)) {
    await sendWebhook(level, title, body, fields);
  }
}

/**
 * Convenience wrappers.
 */
const info     = (title, body, fields) => alert('INFO',     title, body, fields);
const warning  = (title, body, fields) => alert('WARNING',  title, body, fields);
const critical = (title, body, fields) => alert('CRITICAL', title, body, fields);

module.exports = { alert, info, warning, critical, buildDailySummaryEmail };
