'use strict';
const fs   = require('fs');
const path = require('path');

const AUDIT_FILE   = path.resolve(__dirname, '../../audit_log.json');
const REPORTS_DIR  = path.resolve(__dirname, '../../reports');

// ─── CSV Helpers ──────────────────────────────────────────────────────────────

/** Escape a value for CSV: wrap in quotes and escape internal quotes. */
function csvCell(value) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

/** Convert an array of values to a CSV row string. */
function csvRow(cols) {
  return cols.map(csvCell).join(',');
}

// ─── Column Definitions ───────────────────────────────────────────────────────
const COLUMNS = [
  { header: 'Timestamp',         extract: e => e.timestamp?.slice(0, 19) ?? '' },
  { header: 'Action',            extract: e => e.action ?? '' },
  { header: 'Ad Set Name',       extract: e => e.adSetName ?? '' },
  { header: 'ROAS',              extract: e => e.roas != null ? e.roas.toFixed(2) : '' },
  { header: 'Budget From ($)',   extract: e => e.budgetFrom != null ? (e.budgetFrom / 100).toFixed(2) : '' },
  { header: 'Budget To ($)',     extract: e => e.budgetTo   != null ? (e.budgetTo   / 100).toFixed(2) : '' },
  { header: 'Budget Change ($)', extract: e => (e.budgetFrom != null && e.budgetTo != null)
      ? ((e.budgetTo - e.budgetFrom) / 100).toFixed(2)
      : '' },
  { header: 'Reason',            extract: e => e.reason ?? '' },
  { header: 'Inventory (units)', extract: e => e.mockStore?.inventory ?? '' },
  { header: 'Site Health',       extract: e => e.mockStore?.siteHealth ?? '' },
  { header: 'Cart Drop-off',     extract: e => e.mockStore?.dropOff?.cart ?? '' },
  { header: 'Checkout Drop-off', extract: e => e.mockStore?.dropOff?.checkout ?? '' },
  { header: 'Waste Saved ($)',   extract: e => e.wasteSaved?.wasteSavedUsd  != null ? e.wasteSaved.wasteSavedUsd.toFixed(2)  : '' },
  { header: 'Pause Duration (h)',extract: e => e.wasteSaved?.durationHours != null ? e.wasteSaved.durationHours.toFixed(1) : '' },
];

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Read audit_log.json and export today's entries to a CSV file.
 *
 * Output path: reports/YYYY-MM-DD_scaleai_report.csv
 * Creates the reports/ directory if it doesn't exist.
 *
 * @param {string} [date]  YYYY-MM-DD to export (defaults to today)
 * @returns {{ path: string, rowCount: number }}
 */
function exportDailyCsv(date) {
  const targetDate = date || new Date().toISOString().slice(0, 10);

  // ── Load audit log ────────────────────────────────────────────────────────
  let entries = [];
  if (fs.existsSync(AUDIT_FILE)) {
    try {
      entries = JSON.parse(fs.readFileSync(AUDIT_FILE, 'utf8'));
    } catch {
      entries = [];
    }
  }

  // ── Filter to target date ─────────────────────────────────────────────────
  const dayEntries = entries.filter(e =>
    typeof e.timestamp === 'string' && e.timestamp.startsWith(targetDate)
  );

  // ── Build CSV ─────────────────────────────────────────────────────────────
  const headerRow = csvRow(COLUMNS.map(c => c.header));
  const dataRows  = dayEntries.map(e => csvRow(COLUMNS.map(c => c.extract(e))));
  const csv       = [headerRow, ...dataRows].join('\n');

  // ── Write file ────────────────────────────────────────────────────────────
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const outPath = path.join(REPORTS_DIR, `${targetDate}_scaleai_report.csv`);
  fs.writeFileSync(outPath, csv, 'utf8');

  return { path: outPath, rowCount: dayEntries.length };
}

/**
 * Compute a quick stats summary from today's audit log entries.
 * Used by the run summary and daily email.
 *
 * @param {string} [date]  YYYY-MM-DD (defaults to today)
 * @returns {{ scaled, paused, held, blocked, errors, totalBudgetChangePct }}
 */
function getDailyStats(date) {
  const targetDate = date || new Date().toISOString().slice(0, 10);

  let entries = [];
  if (fs.existsSync(AUDIT_FILE)) {
    try {
      entries = JSON.parse(fs.readFileSync(AUDIT_FILE, 'utf8'));
    } catch {
      entries = [];
    }
  }

  const day = entries.filter(e => typeof e.timestamp === 'string' && e.timestamp.startsWith(targetDate));

  const stats = { scaled: 0, paused: 0, held: 0, blocked: 0, errors: 0, resumed: 0, totalBudgetChangePct: 0, wasteSavedUsd: 0 };

  for (const e of day) {
    switch (e.action) {
      case 'SCALE': {
        stats.scaled++;
        if (e.budgetFrom && e.budgetTo) {
          stats.totalBudgetChangePct += ((e.budgetTo - e.budgetFrom) / e.budgetFrom) * 100;
        }
        break;
      }
      case 'PAUSE':  stats.paused++;  break;
      case 'HOLD':   stats.held++;    break;
      case 'BLOCK':  stats.blocked++; break;
      case 'ERROR':  stats.errors++;  break;
      case 'RESUME': {
        stats.resumed++;
        if (e.wasteSaved?.wasteSavedUsd) stats.wasteSavedUsd += e.wasteSaved.wasteSavedUsd;
        break;
      }
    }
  }

  return stats;
}

module.exports = { exportDailyCsv, getDailyStats };
