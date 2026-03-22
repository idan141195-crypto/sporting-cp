'use strict';
const { getInsights }          = require('../meta/insights');
const { getActiveAdSets }      = require('../meta/adSets');
const metaManager              = require('../meta/MetaAdsManager');
const mockStore                = require('../data/MockStoreService');
const budoMap                  = require('../data/BudoMappingService');
const stateCache               = require('../api/StateCache');
const { decide, resolveStock, ETS_SOFT_PAUSE_HOURS, INVENTORY_SCALE } = require('./rules');
const guardrail                = require('./guardrail');
const rollback                 = require('./rollback');
const valueCalculator          = require('./ValueCalculator');
const alertManager             = require('../alerts/AlertManager');
const { log, separator }       = require('../logger');

// ─── Panic Mode: Rollback + Alert ─────────────────────────────────────────────

/**
 * Revert all scaled ad sets to their pre-scale budget, then fire a CRITICAL alert.
 *
 * @param {string} bugPage   The page where BUG_DETECTED occurred
 * @param {object} stats     Mutable stats object — incremented here
 */
async function panicRollback(bugPage, stats) {
  const targets = rollback.getPanicTargets();

  if (targets.length === 0) {
    log('INFO', 'Rollback', { reason: 'No scaled ad sets to revert.' });
    return;
  }

  log('INFO', 'Rollback', {
    reason: `PANIC MODE — BUG_DETECTED on /${bugPage} — reverting ${targets.length} scaled ad set(s)`,
  });

  const ops = targets.map(target => ({
    label: target.adSetName,
    fn:    () => metaManager.updateBudget(target.adSetId, target.preScaleBudgetCents),
    onSuccess: () => {
      rollback.markRolledBack(target.adSetId);
      stats.rollbacks++;
      log('SCALE', target.adSetName, {
        budgetTo: target.preScaleBudgetCents,
        reason:   `ROLLBACK — budget restored to $${(target.preScaleBudgetCents / 100).toFixed(2)} due to BUG_DETECTED on /${bugPage}`,
      });
    },
    onError: (err) => {
      stats.errors++;
      log('ERROR', target.adSetName, { reason: `Rollback failed: ${err.message}` });
    },
  }));

  await metaManager.batchExecute(ops);

  // ── CRITICAL alert for panic rollback ────────────────────────────────────
  await alertManager.critical(
    'PANIC ROLLBACK Triggered',
    `BUG_DETECTED on site page /${bugPage}.\n${targets.length} ad set(s) have been rolled back to their pre-scale budgets.`,
    [
      { name: 'Bug Page',         value: `/${bugPage}` },
      { name: 'Ad Sets Reverted', value: String(targets.length) },
      ...targets.map(t => ({
        name:  t.adSetName,
        value: `Pre-scale: $${(t.preScaleBudgetCents / 100).toFixed(2)}`,
      })),
    ]
  );
}

// ─── Pause All (batch) ────────────────────────────────────────────────────────

async function pauseAll(adSets, reason, stats) {
  const ops = [];

  for (const [adSetId, adSet] of adSets) {
    const check = guardrail.canChange(adSetId, 0);
    if (!check.allowed) {
      stats.blocked++;
      log('BLOCK', adSet.name, { reason: check.reason });
      continue;
    }
    const localAdSetId = adSetId;
    const localAdSet   = adSet;
    ops.push({
      label: adSet.name,
      fn:    () => metaManager.pauseAdSet(localAdSetId),
      onSuccess: () => {
        guardrail.recordChange(localAdSetId, 0);
        stats.paused++;
        log('PAUSE', localAdSet.name, { reason });

        // Track safety pause for value/resume tracking
        const mappedRecord = budoMap.getByAdSetId(localAdSetId);
        valueCalculator.recordPauseStart(
          localAdSetId,
          localAdSet.name,
          'BUG_DETECTED',
          localAdSet.dailyBudgetCents || 0,
          mappedRecord?.mockProductKey ?? null
        );
      },
      onError: (err) => {
        stats.errors++;
        log('ERROR', localAdSet.name, { reason: `Pause failed: ${err.message}` });
      },
    });
  }

  if (ops.length > 0) await metaManager.batchExecute(ops);
}

// ─── Human-Readable Run Summary ───────────────────────────────────────────────

/**
 * Print and optionally webhook the end-of-run summary.
 *
 * @param {object} stats
 * @returns {Promise<string>} The summary line
 */
async function emitRunSummary(stats) {
  const parts = [
    `${stats.scaled} scaled`,
    `${stats.paused} paused`,
    `${stats.held} held`,
    stats.resumed   > 0 ? `${stats.resumed} resumed`      : null,
    stats.blocked   > 0 ? `${stats.blocked} blocked`      : null,
    stats.errors    > 0 ? `${stats.errors} error(s)`      : null,
    stats.rollbacks > 0 ? `${stats.rollbacks} rollback(s)` : null,
  ].filter(Boolean).join(', ');

  const budgetLine = stats.totalBudgetChangePct !== 0
    ? `Total budget \u0394: +${stats.totalBudgetChangePct.toFixed(1)}%.`
    : 'No budget changes applied.';

  const wasteLine = stats.totalWasteSavedUsd > 0
    ? ` Waste saved this run: $${stats.totalWasteSavedUsd.toFixed(2)}.`
    : '';

  const totalWasteUsd = valueCalculator.getTotalWasteSaved() / 100;
  const cumulativeLine = totalWasteUsd > 0 ? ` Cumulative: $${totalWasteUsd.toFixed(2)}.` : '';

  const durationSec = (stats.durationMs / 1000).toFixed(1);
  const summary     = `ScaleAI Run Complete: ${parts}. ${budgetLine}${wasteLine}${cumulativeLine} (${durationSec}s)`;

  const color = stats.errors > 0 ? '\x1b[1;31m' : stats.panicMode ? '\x1b[33m' : '\x1b[32m';
  console.log(`\n${color}  \u2714  ${summary}\x1b[0m\n`);

  // Only webhook if something actionable happened
  const hasMeaningfulAction = stats.scaled > 0 || stats.paused > 0 || stats.resumed > 0 || stats.errors > 0 || stats.rollbacks > 0;
  if (hasMeaningfulAction) {
    const level = stats.errors > 0 || stats.panicMode ? 'WARNING' : 'INFO';
    await alertManager.alert(level, 'Optimizer Run Complete', summary, [
      { name: 'Scaled',        value: String(stats.scaled)   },
      { name: 'Paused',        value: String(stats.paused)   },
      { name: 'Resumed',       value: String(stats.resumed)  },
      { name: 'Held',          value: String(stats.held)     },
      { name: 'Blocked',       value: String(stats.blocked)  },
      { name: 'Errors',        value: String(stats.errors)   },
      { name: 'Budget \u0394', value: `+${stats.totalBudgetChangePct.toFixed(1)}%` },
      { name: 'Waste Saved',   value: `$${stats.totalWasteSavedUsd.toFixed(2)} (run) / $${totalWasteUsd.toFixed(2)} (all-time)` },
      { name: 'Duration',      value: `${durationSec}s`      },
    ]);
  }

  return summary;
}

// ─── Main Optimizer Run ───────────────────────────────────────────────────────

/**
 * ScaleAI Optimizer — main execution loop.
 *
 * @returns {Promise<{
 *   scaled, paused, held, blocked, errors, rollbacks,
 *   panicMode, totalBudgetChangePct, durationMs, summary
 * }>}
 */
async function run() {
  separator('ScaleAI Optimizer Run START');
  const startMs = Date.now();

  const stats = {
    scaled: 0, paused: 0, held: 0, blocked: 0, resumed: 0,
    errors: 0, rollbacks: 0, panicMode: false,
    totalBudgetChangePct: 0, totalWasteSavedUsd: 0,
  };

  // ── 1. MockStore snapshot ─────────────────────────────────────────────────
  const snap = mockStore.getSnapshot();

  log('INFO', 'MockStore', {
    reason: `Site: ${snap.siteHealth.status}` +
            (snap.siteHealth.bugPage ? ` (/${snap.siteHealth.bugPage})` : '') +
            ` | High drop-off: ${[...snap.dropOffRates.entries()].filter(([,v]) => v === 'HIGH').map(([k]) => k).join(', ') || 'none'}`,
  });
  log('INFO', 'MockStore Inventory', {
    reason: [...snap.inventory.entries()].map(([p, q]) => `${p}:${q}`).join(' | '),
  });

  // ── 2. Site health gate ───────────────────────────────────────────────────
  if (snap.siteHealth.status === 'BUG_DETECTED') {
    stats.panicMode = true;
    const bugPage   = snap.siteHealth.bugPage;

    await panicRollback(bugPage, stats);

    const adSets = await getActiveAdSets();
    await pauseAll(adSets, `Site BUG_DETECTED on /${bugPage}`, stats);

    stats.durationMs = Date.now() - startMs;
    stats.summary    = await emitRunSummary(stats);
    stateCache.update({ snap, adSets: null, insights: null, stats, decisions: new Map() });
    separator('ScaleAI Optimizer Run END (BUG_DETECTED)');
    return stats;
  }

  // ── 3. Fetch Meta data ────────────────────────────────────────────────────
  let insights, adSets;
  try {
    [insights, adSets] = await Promise.all([getInsights(), getActiveAdSets()]);
  } catch (err) {
    stats.errors++;
    log('ERROR', 'System', { reason: `Meta API fetch failed: ${err.message}` });
    stats.durationMs = Date.now() - startMs;
    stats.summary    = await emitRunSummary(stats);
    separator('ScaleAI Optimizer Run END (Meta fetch error)');
    return stats;
  }

  log('INFO', 'System',    { reason: `${insights.length} insight rows | ${adSets.size} active ad sets` });
  log('INFO', 'Guardrail', { reason: guardrail.getSummary().replace(/\n/g, ' | ') });
  log('INFO', 'Rollback',  { reason: rollback.getSummary().replace(/\n/g, ' | ') });
  log('INFO', 'ValueCalc', { reason: valueCalculator.getSummary() });

  const insightMap = new Map(insights.map(i => [i.adSetId, i]));

  // ── 4a. Total active budget (for global cap check) ────────────────────────
  const totalActiveBudgetCents = [...adSets.values()]
    .reduce((sum, a) => sum + (a.dailyBudgetCents || 0), 0);

  // ── 4b. Autonomous Resume Phase ───────────────────────────────────────────
  // Check every ScaleAI-paused ad set to see if its issue has been resolved.
  const activePauses = valueCalculator.getActivePauses();
  const resumeOps    = [];

  for (const [adSetId, pauseRecord] of activePauses) {
    let shouldResume = false;
    let resumeReason = '';

    if (pauseRecord.pauseReason === 'LOW_INVENTORY' && pauseRecord.productKey) {
      const currentStock = snap.inventory.get(pauseRecord.productKey) ?? null;
      if (currentStock !== null && currentStock > INVENTORY_SCALE) {
        shouldResume = true;
        resumeReason = `Inventory recovered: ${currentStock} units > ${INVENTORY_SCALE} — auto-resuming`;
      }
    } else if (pauseRecord.pauseReason === 'BUG_DETECTED') {
      if (snap.siteHealth.status === 'OK') {
        shouldResume = true;
        resumeReason = 'Site health recovered to OK — auto-resuming';
      }
    }

    if (!shouldResume) continue;

    const localPauseRecord = pauseRecord;
    const localAdSetId     = adSetId;

    // Restore budget: if rollback has a pre-scale snapshot use that, else use
    // the budget stored at pause time (which is already the correct baseline).
    const panicTarget   = rollback.getPanicTargets().find(t => t.adSetId === localAdSetId);
    const restoreCents  = panicTarget ? panicTarget.preScaleBudgetCents : localPauseRecord.dailyBudgetCents;

    resumeOps.push({
      label: localPauseRecord.adSetName,
      fn: async () => {
        await metaManager.resumeAdSet(localAdSetId);
        if (restoreCents && restoreCents !== localPauseRecord.dailyBudgetCents) {
          await metaManager.updateBudget(localAdSetId, restoreCents);
        }
        return restoreCents;
      },
      onSuccess: (restoredCents) => {
        if (panicTarget) rollback.markRolledBack(localAdSetId);
        const wasteSavedCents = valueCalculator.recordPauseEnd(localAdSetId);
        stats.resumed++;
        stats.totalWasteSavedUsd += wasteSavedCents / 100;
        log('INFO', localPauseRecord.adSetName, {
          reason: `${resumeReason}. Budget restored to $${(restoredCents / 100).toFixed(2)}. ` +
                  `Waste saved: $${(wasteSavedCents / 100).toFixed(2)}.`,
        });
        alertManager.info(
          `Auto-Resumed: "${localPauseRecord.adSetName}"`,
          `${localPauseRecord.pauseReason} issue resolved. Campaign resumed and budget restored. ` +
          `Estimated waste prevented: $${(wasteSavedCents / 100).toFixed(2)}.`,
          [
            { name: 'Pause Reason', value: localPauseRecord.pauseReason },
            { name: 'Waste Saved',  value: `$${(wasteSavedCents / 100).toFixed(2)}` },
            { name: 'Budget',       value: `$${(restoredCents / 100).toFixed(2)}/day` },
          ]
        );
      },
      onError: (err) => {
        stats.errors++;
        log('ERROR', localPauseRecord.adSetName, { reason: `Auto-resume failed: ${err.message}` });
      },
    });
  }

  if (resumeOps.length > 0) {
    log('INFO', 'Resume', { reason: `Auto-resuming ${resumeOps.length} recovered ad set(s)` });
    await metaManager.batchExecute(resumeOps);
  }

  // ── 4c. Decision loop ──────────────────────────────────────────────────────
  const pauseOps = [];
  const scaleOps = [];

  for (const [adSetId, adSet] of adSets) {
    const insight = insightMap.get(adSetId);
    if (!insight) {
      stats.held++;
      log('HOLD', adSet.name, { reason: 'No insight data for today yet' });
      continue;
    }

    // ── Inventory lookup: exact mapping wins, fuzzy fallback for unmapped sets ──
    const mappedRecord = budoMap.getByAdSetId(adSetId);
    const stockQty     = mappedRecord
      ? budoMap.getInventory(adSetId, snap.inventory)   // exact lookup via mockProductKey
      : resolveStock(adSet.name, snap.inventory);        // fuzzy fallback for unmapped ad sets

    // ── ETS (Estimated Time to Stockout) ─────────────────────────────────────
    const velocity = (snap.salesVelocity && mappedRecord)
      ? snap.salesVelocity.get(mappedRecord.mockProductKey) ?? null
      : null;
    const etsHours = (stockQty !== null && velocity && velocity > 0)
      ? Math.round((stockQty / velocity) * 10) / 10
      : null;

    if (mappedRecord) {
      log('INFO', adSet.name, {
        reason: `Budo mapping: product "${mappedRecord.productName}" (ID ${mappedRecord.productId}) → stock: ${stockQty ?? 'N/A'}` +
                (etsHours !== null ? ` | velocity: ${velocity}/hr | ETS: ${etsHours.toFixed(1)}h` : ''),
      });
    }

    // ── Pre-emptive stockout alert: high ROAS but running out soon ────────────
    if (etsHours !== null && etsHours < ETS_SOFT_PAUSE_HOURS && insight.roas > 5.0) {
      await alertManager.warning(
        `Stockout Alert: "${adSet.name}"`,
        `High ROAS ${insight.roas.toFixed(2)}x campaign heading toward stockout in ~${etsHours.toFixed(1)}h at ${velocity}/hr. ScaleAI is holding the scale to extend inventory runway.`,
        [
          { name: 'Ad Set',   value: adSet.name },
          { name: 'ROAS',     value: `${insight.roas.toFixed(2)}x` },
          { name: 'Stock',    value: `${stockQty} units` },
          { name: 'Velocity', value: `${velocity} units/hr` },
          { name: 'ETS',      value: `${etsHours.toFixed(1)}h` },
        ]
      );
    }

    // Build an inventory map with only the resolved stock so rules.js works correctly
    const resolvedInventory = new Map(snap.inventory);
    if (mappedRecord && stockQty !== null) {
      // Inject the resolved stock under the exact ad set name so rules.resolveStock finds it
      resolvedInventory.set(adSet.name.toLowerCase(), stockQty);
    }

    const decision = decide(insight, resolvedInventory, snap.siteHealth, snap.dropOffRates, etsHours);
    const mockCtx  = {
      inventory:       stockQty,
      etsHours,
      salesVelocity:   velocity,
      siteHealth:      snap.siteHealth.status,
      dropOff: { cart: snap.dropOffRates.get('cart'), checkout: snap.dropOffRates.get('checkout') },
      budoProduct:     mappedRecord ? mappedRecord.productName : null,
    };

    if (decision.action === 'HOLD') {
      stats.held++;
      log('HOLD', adSet.name, { roas: insight.roas, reason: decision.reason, mockStore: mockCtx });
      continue;
    }

    if (decision.action === 'PAUSE') {
      const check = guardrail.canChange(adSetId, 0);
      if (!check.allowed) {
        stats.blocked++;
        log('BLOCK', adSet.name, { roas: insight.roas, reason: check.reason, mockStore: mockCtx });
        continue;
      }

      // Classify pause reason for safety tracking + auto-resume
      const pauseCategory =
        decision.reason.includes('BUG_DETECTED') ? 'BUG_DETECTED' :
        decision.reason.includes('inventory')    ? 'LOW_INVENTORY' :
        null;

      const localAdSetId    = adSetId;
      const localAdSet      = adSet;
      const localInsight    = insight;
      const localDecision   = decision;
      const localMockCtx    = mockCtx;
      const localMapped     = mappedRecord;
      const localCategory   = pauseCategory;

      pauseOps.push({
        label: adSet.name,
        fn:    () => metaManager.pauseAdSet(localAdSetId),
        onSuccess: () => {
          guardrail.recordChange(localAdSetId, 0);
          stats.paused++;
          log('PAUSE', localAdSet.name, { roas: localInsight.roas, reason: localDecision.reason, mockStore: localMockCtx });

          // Track safety pauses (LOW_INVENTORY or BUG_DETECTED) for value + resume
          if (localCategory) {
            valueCalculator.recordPauseStart(
              localAdSetId,
              localAdSet.name,
              localCategory,
              localAdSet.dailyBudgetCents || 0,
              localMapped?.mockProductKey ?? null
            );
          }
        },
        onError: (err) => {
          stats.errors++;
          log('ERROR', localAdSet.name, { reason: `Pause failed: ${err.message}` });
        },
      });
      continue;
    }

    if (decision.action === 'SCALE') {
      const PCT_CHANGE = Math.round((decision.factor - 1) * 100);
      const check      = guardrail.canChange(adSetId, PCT_CHANGE);
      if (!check.allowed) {
        stats.blocked++;
        log('BLOCK', adSet.name, { roas: insight.roas, reason: check.reason, mockStore: mockCtx });
        continue;
      }

      // ── Global Budget Cap check ──────────────────────────────────────────
      const proposedNewCents = Math.round(adSet.dailyBudgetCents * decision.factor);
      const proposedAddCents = proposedNewCents - adSet.dailyBudgetCents;
      const globalCheck      = guardrail.checkGlobalCap(totalActiveBudgetCents, proposedAddCents);
      if (!globalCheck.allowed) {
        stats.blocked++;
        log('BLOCK', adSet.name, { roas: insight.roas, reason: globalCheck.reason, mockStore: mockCtx });
        continue;
      }

      const localAdSet    = adSet;
      const localInsight  = insight;
      const localDecision = decision;
      const localMockCtx  = mockCtx;

      scaleOps.push({
        label: adSet.name,
        fn: async () => {
          const liveCents   = await metaManager.syncBudget(adSetId);
          const localCents  = localAdSet.dailyBudgetCents;
          let baselineCents = localCents;

          if (liveCents !== localCents) {
            log('BLOCK', localAdSet.name, {
              reason: `Sync Warning — local $${(localCents/100).toFixed(2)} ≠ Meta $${(liveCents/100).toFixed(2)} — using Meta value`,
            });
            baselineCents = liveCents;
          }

          if (!rollback.hasActiveSnapshot(adSetId)) {
            rollback.recordPreScale(adSetId, localAdSet.name, baselineCents);
          }

          const newBudget = Math.round(baselineCents * localDecision.factor);
          await metaManager.updateBudget(adSetId, newBudget);
          return { baselineCents, newBudget };
        },
        onSuccess: ({ baselineCents, newBudget }) => {
          guardrail.recordChange(adSetId, PCT_CHANGE);
          stats.scaled++;
          stats.totalBudgetChangePct += PCT_CHANGE;
          log('SCALE', localAdSet.name, {
            roas:       localInsight.roas,
            budgetFrom: baselineCents,
            budgetTo:   newBudget,
            reason:     localDecision.reason,
            mockStore:  localMockCtx,
          });
        },
        onError: (err) => {
          stats.errors++;
          log('ERROR', localAdSet.name, { reason: `Scale failed: ${err.message}` });
        },
      });
    }
  }

  // ── 5. Batch execute ──────────────────────────────────────────────────────
  if (pauseOps.length > 0) {
    log('INFO', 'Batch', { reason: `Executing ${pauseOps.length} PAUSE operation(s)` });
    await metaManager.batchExecute(pauseOps);
  }
  if (scaleOps.length > 0) {
    log('INFO', 'Batch', { reason: `Executing ${scaleOps.length} SCALE operation(s)` });
    await metaManager.batchExecute(scaleOps);
  }
  if (pauseOps.length === 0 && scaleOps.length === 0) {
    log('INFO', 'System', { reason: 'No actionable decisions this cycle — all HOLD or BLOCK' });
  }

  stats.durationMs = Date.now() - startMs;
  stats.summary    = await emitRunSummary(stats);

  // ── Update StateCache — API server reads from here ─────────────────────────
  stateCache.update({ snap, adSets, insights, stats, decisions: new Map() });

  separator('ScaleAI Optimizer Run END');
  return stats;
}

module.exports = { run };
