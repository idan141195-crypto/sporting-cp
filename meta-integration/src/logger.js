'use strict';
const fs   = require('fs');
const path = require('path');

const LOG_FILE   = path.resolve(__dirname, '../actions.log');
const AUDIT_FILE = path.resolve(__dirname, '../audit_log.json');

const COLORS = {
  SCALE:  '\x1b[32m',  // green
  PAUSE:  '\x1b[31m',  // red
  HOLD:   '\x1b[90m',  // gray
  BLOCK:  '\x1b[33m',  // yellow
  INFO:   '\x1b[36m',  // cyan
  ERROR:  '\x1b[31m',  // red
  RESET:  '\x1b[0m',
};

function timestamp() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

/**
 * Log an optimizer action to console + actions.log + audit_log.json.
 *
 * @param {"SCALE"|"PAUSE"|"HOLD"|"BLOCK"|"INFO"|"ERROR"} action
 * @param {string} adSetName
 * @param {object} details  — { roas?, budgetFrom?, budgetTo?, reason, mockStore? }
 *   mockStore: { inventory?, siteHealth?, dropOff? }  — optional context snapshot
 */
function log(action, adSetName, details = {}) {
  const ts     = timestamp();
  const color  = COLORS[action] || COLORS.INFO;
  const reset  = COLORS.RESET;
  const padded = action.padEnd(5);

  let line = `[${ts}] ${padded} | "${adSetName}"`;

  if (details.roas !== undefined) {
    line += ` | ROAS: ${parseFloat(details.roas).toFixed(2)}`;
  }
  if (details.budgetFrom !== undefined && details.budgetTo !== undefined) {
    const from = (details.budgetFrom / 100).toFixed(2);
    const to   = (details.budgetTo   / 100).toFixed(2);
    line += ` | $${from}→$${to}`;
  }
  if (details.reason) {
    line += ` | ${details.reason}`;
  }

  // ── Console (colored) ──────────────────────────────────────────────────────
  console.log(`${color}${line}${reset}`);

  // ── actions.log (plain text) ───────────────────────────────────────────────
  fs.appendFileSync(LOG_FILE, line + '\n');

  // ── audit_log.json (structured, machine-readable) ─────────────────────────
  if (action !== 'INFO') {  // INFO entries are system noise, not decisions
    logAudit({
      timestamp:  new Date().toISOString(),
      action,
      adSetName,
      roas:       details.roas      !== undefined ? parseFloat(details.roas) : null,
      budgetFrom: details.budgetFrom !== undefined ? details.budgetFrom : null,
      budgetTo:   details.budgetTo   !== undefined ? details.budgetTo   : null,
      reason:     details.reason     || null,
      mockStore:  details.mockStore   || null,
    });
  }
}

/**
 * Append a structured entry to audit_log.json.
 * File is maintained as a JSON array — safe for small-to-medium volumes.
 *
 * @param {object} entry
 */
function logAudit(entry) {
  let existing = [];
  if (fs.existsSync(AUDIT_FILE)) {
    try {
      existing = JSON.parse(fs.readFileSync(AUDIT_FILE, 'utf8'));
    } catch {
      existing = [];
    }
  }
  existing.push(entry);
  fs.writeFileSync(AUDIT_FILE, JSON.stringify(existing, null, 2));
}

/**
 * Log a run separator (start/end of optimizer cycle).
 */
function separator(label) {
  const line = `\n${'─'.repeat(72)}\n[${timestamp()}] ${label}\n${'─'.repeat(72)}`;
  console.log(`${COLORS.INFO}${line}${COLORS.RESET}`);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

module.exports = { log, logAudit, separator };
