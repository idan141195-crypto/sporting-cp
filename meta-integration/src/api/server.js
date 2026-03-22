'use strict';
const fs       = require('fs');
const path     = require('path');
const express  = require('express');
const { config }       = require('../config');
const stateCache       = require('./StateCache');
const budoMap          = require('../data/BudoMappingService');
const mockStore        = require('../data/MockStoreService');
const metaManager      = require('../meta/MetaAdsManager');
const valueCalculator  = require('../engine/ValueCalculator');

const PORT       = Number(process.env.API_PORT) || 3001;
const AUDIT_FILE = path.resolve(__dirname, '../../audit_log.json');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(isoString) {
  if (!isoString) return null;
  const ms  = Date.now() - new Date(isoString).getTime();
  const sec = Math.floor(ms / 1000);
  if (sec < 60)  return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60)  return `${min}m ago`;
  return `${Math.floor(min / 60)}h ago`;
}

function loadAuditLog() {
  if (!fs.existsSync(AUDIT_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(AUDIT_FILE, 'utf8')); }
  catch { return []; }
}

function appendAuditEntry(entry) {
  const existing = loadAuditLog();
  existing.push(entry);
  fs.writeFileSync(AUDIT_FILE, JSON.stringify(existing, null, 2));
}

function buildLogMessage(entry) {
  if (entry.message) return entry.message;
  if (entry.action === 'SCALE' && entry.budgetFrom != null && entry.budgetTo != null) {
    const pct = Math.round(((entry.budgetTo / entry.budgetFrom) - 1) * 100);
    return `Budget updated: $${(entry.budgetFrom/100).toFixed(2)} → $${(entry.budgetTo/100).toFixed(2)} (+${pct}%)`;
  }
  if (entry.action === 'PAUSE')  return entry.reason ?? 'Ad set paused';
  if (entry.action === 'RESUME') return 'Ad set resumed and set to ACTIVE';
  if (entry.action === 'HOLD')   return entry.reason ?? 'No action — holding';
  if (entry.action === 'BLOCK')  return entry.reason ?? 'Action blocked by guardrail';
  return entry.reason ?? entry.action;
}

// ─── Recommendation Engine ────────────────────────────────────────────────────

/**
 * Generate up to 3 strategic recommendations from live data.
 *
 * Each tip has:
 *   urgency:  'critical' | 'warning' | 'opportunity'
 *   title:    Short headline
 *   body:     2–3 sentence explanation
 *   adSetId:  (optional) the ad set this applies to
 *   action:   (optional) quick-action payload the frontend can fire directly
 *
 * Rules (evaluated in priority order):
 *  1. CRITICAL — Bug recovered: recently paused ad sets still PAUSED but site now OK
 *  2. CRITICAL — Low inventory on a scaling ad set (<= 15 units, currently SCALE decision)
 *  3. WARNING  — Blocked by guardrail multiple times today (>= 2 BLOCK entries)
 *  4. OPPORTUNITY — High-ROAS ad set held back solely by cart/checkout drop-off
 */
function generateRecommendations(pairs, auditLog, freshSnap) {
  const tips = [];

  // ── Tip 0: Stockout imminent on a high-performing campaign ───────────────
  const stockoutRisks = pairs.filter(p =>
    p.etsHours !== null && p.etsHours < 6 && p.roas !== null && p.roas > 5.0
  );
  stockoutRisks.slice(0, 3 - tips.length).forEach(pair => {
    const budgetReduction = Math.round(
      ((pair.dailyBudgetUsd ?? 0) * 0.80 * 100) / 100
    );
    tips.push({
      urgency: 'critical',
      title:   `⏱ Stockout in ${pair.etsHours.toFixed(1)}h — "${pair.productName}"`,
      body:    `"${pair.productName}" is performing at **${pair.roas.toFixed(2)}x ROAS** but will run out of stock in approximately **${pair.etsHours.toFixed(1)} hours** ` +
               `at current sales velocity of **${pair.salesVelocity?.toFixed(1)} units/hr**. ` +
               `ScaleAI has soft-paused scaling. I recommend a **20% budget reduction** to stretch the remaining inventory until the next restock.`,
      adSetId:   pair.adSetId,
      adSetName: pair.adSetName ?? pair.productName,
      etsHours:  pair.etsHours,
      action: {
        type:      'scale_budget',
        adSetId:   pair.adSetId,
        adSetName: pair.adSetName ?? pair.productName,
        factor:    0.80,
        label:     'Apply −20% Budget Reduction',
      },
    });
  });

  // ── Tip 1: Site recovered but ads still paused ────────────────────────────
  const today = new Date().toISOString().slice(0, 10);
  const todayPauses = auditLog.filter(e =>
    e.timestamp?.startsWith(today) &&
    e.action === 'PAUSE' &&
    e.reason?.includes('BUG_DETECTED')
  );
  if (todayPauses.length > 0 && freshSnap.siteHealth.status === 'OK') {
    todayPauses.slice(0, 3).forEach(entry => {
      const pair = pairs.find(p => p.adSetName === entry.adSetName);
      if (!pair) return;
      tips.push({
        urgency: 'critical',
        title:   `Recover "${entry.adSetName}"`,
        body:    `This ad set was paused earlier because a bug was detected on your site. ` +
                 `The site health has since recovered to ✅ OK. ` +
                 `You can safely resume this campaign and restart scaling.`,
        adSetId:    pair.adSetId,
        adSetName:  pair.adSetName,
        action: { type: 'resume', adSetId: pair.adSetId, adSetName: pair.adSetName },
      });
    });
  }

  // ── Tip 2: Low inventory on a currently-scaling ad set ───────────────────
  if (tips.length < 3) {
    const lowStockScalers = pairs.filter(p =>
      p.liveDecision === 'SCALE' &&
      p.inventory !== null &&
      p.inventory <= 15
    );
    lowStockScalers.slice(0, 3 - tips.length).forEach(pair => {
      const hoursToDepletion = pair.spend && pair.spend > 0 && pair.inventory !== null
        ? Math.round((pair.inventory / (pair.spend / 8)) * 10) / 10
        : null;

      tips.push({
        urgency: 'critical',
        title:   `Stock Alert: "${pair.productName}"`,
        body:    `"${pair.productName}" is scaling at ROAS ${pair.roas?.toFixed(2) ?? '?'}x but has only **${pair.inventory} units** remaining. ` +
                 (hoursToDepletion ? `At current velocity, stockout in ~${hoursToDepletion}h. ` : '') +
                 `Reduce scale to +10% to extend stock runway and avoid wasted ad spend on an out-of-stock product.`,
        adSetId:   pair.adSetId,
        adSetName: pair.adSetName,
        action: {
          type:      'scale_budget',
          adSetId:   pair.adSetId,
          adSetName: pair.adSetName,
          factor:    1.10,
          label:     'Apply Conservative +10% Scale',
        },
      });
    });
  }

  // ── Tip 3: Guardrail is blocking at scale ─────────────────────────────────
  if (tips.length < 3) {
    const todayBlocks = auditLog.filter(e =>
      e.timestamp?.startsWith(today) && e.action === 'BLOCK'
    );
    if (todayBlocks.length >= 2) {
      const uniqueAdSets = [...new Set(todayBlocks.map(e => e.adSetName))];
      tips.push({
        urgency: 'warning',
        title:   `Guardrail Limiting Optimization`,
        body:    `**${todayBlocks.length} budget changes** were blocked today across ${uniqueAdSets.length} ad set(s) (${uniqueAdSets.slice(0, 2).join(', ')}). ` +
                 `The safety guardrail is working correctly, but if performance is consistently strong, ` +
                 `consider raising MAX_CHANGES_PER_DAY in your .env to allow more aggressive optimization.`,
        adSetId:  null,
        action:   null,
      });
    }
  }

  // ── Tip 4: High-ROAS HOLD because of funnel drop-off ─────────────────────
  if (tips.length < 3) {
    const funnelHolds = pairs.filter(p =>
      p.liveDecision === 'HOLD' &&
      p.roas !== null &&
      p.roas > 5.0 &&
      (p.dropOff?.cart === 'HIGH' || p.dropOff?.checkout === 'HIGH')
    );
    funnelHolds.slice(0, 3 - tips.length).forEach(pair => {
      const stage = pair.dropOff?.checkout === 'HIGH' ? 'checkout' : 'cart';
      tips.push({
        urgency: 'opportunity',
        title:   `Unlock "${pair.productName}" — Fix ${stage}`,
        body:    `"${pair.productName}" has an excellent ROAS of **${pair.roas?.toFixed(2)}x** and is ready to scale, ` +
                 `but ScaleAI is holding it back because of HIGH drop-off at the **${stage}** stage. ` +
                 `Fix the ${stage} UX friction and this campaign will automatically qualify for the +15% budget increase on the next cycle.`,
        adSetId:   pair.adSetId,
        adSetName: pair.adSetName,
        action:    null, // no direct action — this requires a UX fix
      });
    });
  }

  // ── Tip 5: Fallback — overall system health ───────────────────────────────
  if (tips.length === 0) {
    const scalingCount = pairs.filter(p => p.liveDecision === 'SCALE').length;
    const pauseCount   = pairs.filter(p => p.liveDecision === 'PAUSE').length;
    tips.push({
      urgency: 'opportunity',
      title:   'System Operating Normally',
      body:    `ScaleAI is running cleanly. **${scalingCount}** campaign(s) are scaling, **${pauseCount}** paused. ` +
               `No critical inventory alerts, no site bugs detected. ` +
               `All guardrails are green — your automated engine is optimizing within safe parameters.`,
      adSetId: null,
      action:  null,
    });
  }

  return tips.slice(0, 3);
}

// ─── App Setup ────────────────────────────────────────────────────────────────

function createServer() {
  const app = express();

  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin',  '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.sendStatus(200); return; }
    next();
  });

  app.use(express.json());

  // ── GET /api/health ───────────────────────────────────────────────────────
  app.get('/api/health', (_req, res) => {
    const snap = stateCache.getSnapshot();
    res.json({ status: 'ok', lastRunAt: snap.lastRunAt, runCount: snap.runCount, account: config.META_AD_ACCOUNT_ID });
  });

  // ── GET /api/mapping ──────────────────────────────────────────────────────
  app.get('/api/mapping', (_req, res) => {
    res.json({ accountId: config.META_AD_ACCOUNT_ID, pairs: budoMap.getAllPairs() });
  });

  // ── GET /api/status ───────────────────────────────────────────────────────
  app.get('/api/status', (_req, res) => {
    const cache      = stateCache.getSnapshot();
    const freshSnap  = mockStore.getSnapshot();
    const { decide } = require('../engine/rules');

    const pairs = budoMap.getAllPairs().map(product => {
      const adSetId  = product.metaAdSetId;
      const adSet    = cache.adSets[adSetId]      ?? {};
      const insight  = cache.insights[adSetId]    ?? {};
      const lastAct  = cache.lastActions[adSetId] ?? {};
      const inventory = freshSnap.inventory.get(product.mockProductKey) ?? null;

      const salesVelocity = freshSnap.salesVelocity
        ? freshSnap.salesVelocity.get(product.mockProductKey) ?? null
        : null;
      const etsHours = (inventory !== null && salesVelocity && salesVelocity > 0)
        ? Math.round((inventory / salesVelocity) * 10) / 10
        : null;

      const decision = decide(
        { adSetId, adSetName: product.metaAdSetName, roas: insight.roas ?? 0, spend: insight.spend ?? 0 },
        freshSnap.inventory,
        freshSnap.siteHealth,
        freshSnap.dropOffRates,
        etsHours
      );

      return {
        productId:          product.productId,
        productName:        product.productName,
        category:           product.category,
        mockProductKey:     product.mockProductKey,
        adSetId,
        adSetName:          adSet.name ?? product.metaAdSetName,
        adSetStatus:        adSet.status ?? 'UNKNOWN',
        dailyBudgetUsd:     adSet.dailyBudgetCents != null ? adSet.dailyBudgetCents / 100 : null,
        roas:               insight.roas  ?? null,
        spend:              insight.spend ?? null,
        impressions:        insight.impressions ?? null,
        clicks:             insight.clicks      ?? null,
        inventory,
        salesVelocity,
        etsHours,
        stockoutWarning:    etsHours !== null && etsHours < 6,
        siteHealth:         freshSnap.siteHealth.status,
        dropOff: {
          cart:     freshSnap.dropOffRates.get('cart')     ?? 'LOW',
          checkout: freshSnap.dropOffRates.get('checkout') ?? 'LOW',
        },
        liveDecision:       decision.action,
        liveDecisionReason: decision.reason,
        lastAction:         lastAct.action ?? null,
        lastActionAt:       lastAct.at     ?? null,
        lastActionAgo:      timeAgo(lastAct.at),
        lastActionReason:   lastAct.reason ?? null,
      };
    });

    const activePauses = valueCalculator.getActivePauses();
    const activePauseList = [...activePauses.values()].map(p => ({
      adSetName:        p.adSetName,
      pauseReason:      p.pauseReason,
      pausedAt:         p.pausedAt,
      estimatedWasteSavedUsd: valueCalculator.calculateWasteSaved(p.pausedAt, p.dailyBudgetCents) / 100,
    }));

    res.json({
      lastUpdated:         new Date().toISOString(),
      lastRunAt:           cache.lastRunAt,
      runCount:            cache.runCount,
      accountId:           config.META_AD_ACCOUNT_ID,
      siteHealth:          freshSnap.siteHealth.status,
      bugPage:             freshSnap.siteHealth.bugPage ?? null,
      totalWasteSavedUsd:  valueCalculator.getTotalWasteSaved() / 100,
      activeSafetyPauses:  activePauseList,
      pairs,
    });
  });

  // ── GET /api/ai-recommendations ───────────────────────────────────────────
  // Rule-based strategic tips generated from live bridge data + audit history.
  app.get('/api/ai-recommendations', (_req, res) => {
    const cache     = stateCache.getSnapshot();
    const freshSnap = mockStore.getSnapshot();
    const auditLog  = loadAuditLog();
    const { decide } = require('../engine/rules');

    // Re-build pairs (same as /api/status)
    const pairs = budoMap.getAllPairs().map(product => {
      const adSetId = product.metaAdSetId;
      const insight = cache.insights[adSetId] ?? {};
      const adSet   = cache.adSets[adSetId]   ?? {};
      const inventory = freshSnap.inventory.get(product.mockProductKey) ?? null;

      const salesVelocity = freshSnap.salesVelocity
        ? freshSnap.salesVelocity.get(product.mockProductKey) ?? null
        : null;
      const etsHours = (inventory !== null && salesVelocity && salesVelocity > 0)
        ? Math.round((inventory / salesVelocity) * 10) / 10
        : null;

      const decision = decide(
        { adSetId, adSetName: product.metaAdSetName, roas: insight.roas ?? 0, spend: insight.spend ?? 0 },
        freshSnap.inventory,
        freshSnap.siteHealth,
        freshSnap.dropOffRates,
        etsHours
      );
      return {
        ...product,
        adSetName:    adSet.name ?? product.metaAdSetName,
        roas:         insight.roas  ?? null,
        spend:        insight.spend ?? null,
        inventory,
        salesVelocity,
        etsHours,
        stockoutWarning: etsHours !== null && etsHours < 6,
        dropOff: {
          cart:     freshSnap.dropOffRates.get('cart')     ?? 'LOW',
          checkout: freshSnap.dropOffRates.get('checkout') ?? 'LOW',
        },
        liveDecision: decision.action,
      };
    });

    const tips = generateRecommendations(pairs, auditLog, freshSnap);

    res.json({
      generatedAt: new Date().toISOString(),
      siteHealth:  freshSnap.siteHealth.status,
      tips,
      // Context summary for Claude if the frontend wants to enrich tips via LLM
      contextSummary: {
        totalPairs:    pairs.length,
        scaling:       pairs.filter(p => p.liveDecision === 'SCALE').length,
        paused:        pairs.filter(p => p.liveDecision === 'PAUSE').length,
        held:          pairs.filter(p => p.liveDecision === 'HOLD').length,
        auditLogSize:  auditLog.length,
      },
    });
  });

  // ── GET /api/live-feed ────────────────────────────────────────────────────
  // Top 5 ad sets from Meta (all active, not just mapped ones), sorted by ROAS.
  // Used by the Home page Live Feed section.
  app.get('/api/live-feed', async (_req, res) => {
    try {
      const { getActiveAdSets } = require('../meta/adSets');
      const { getInsights }     = require('../meta/insights');

      const [adSetsMap, insightsArr] = await Promise.all([
        getActiveAdSets(),
        getInsights(),
      ]);

      const insightMap = new Map(insightsArr.map(i => [i.adSetId, i]));
      const accountNum = config.META_AD_ACCOUNT_ID.replace('act_', '');
      let   totalCents = 0;
      const all        = [];

      for (const [id, adSet] of adSetsMap.entries()) {
        totalCents += adSet.dailyBudgetCents;
        const ins   = insightMap.get(id) ?? {};
        all.push({
          adSetId:        id,
          adSetName:      adSet.name,
          status:         adSet.status,
          dailyBudgetUsd: adSet.dailyBudgetCents / 100,
          roas:           ins.roas        ?? null,
          spend:          ins.spend       ?? null,
          impressions:    ins.impressions ?? null,
          clicks:         ins.clicks      ?? null,
          viewInMetaUrl:  `https://adsmanager.facebook.com/adsmanager/manage/adsets?act=${accountNum}&filter_set=HAS_ID_${id}`,
        });
      }

      // Sort by ROAS descending — nulls last
      all.sort((a, b) => {
        if (a.roas === null && b.roas === null) return 0;
        if (a.roas === null) return 1;
        if (b.roas === null) return -1;
        return b.roas - a.roas;
      });

      res.json({
        accountId:      config.META_AD_ACCOUNT_ID,
        totalBudgetUsd: totalCents / 100,
        totalAdSets:    adSetsMap.size,
        topAdSets:      all.slice(0, 5),
        fetchedAt:      new Date().toISOString(),
      });
    } catch (err) {
      // 200 with error field so the frontend can show a graceful offline state
      res.json({
        error:          err.message,
        accountId:      config.META_AD_ACCOUNT_ID,
        totalBudgetUsd: 0,
        totalAdSets:    0,
        topAdSets:      [],
        fetchedAt:      new Date().toISOString(),
      });
    }
  });

  // ── Shared manual action handler (used by both /api/action and /api/apply-action)
  async function handleManualAction(req, res) {
    const { type, adSetId, adSetName, factor, source = 'manual' } = req.body ?? {};

    if (!type || !adSetId) {
      return res.status(400).json({ success: false, error: 'type and adSetId are required' });
    }

    try {
      let responsePayload;

      switch (type) {
        case 'scale_budget': {
          const f         = Number(factor) || 1.10;
          const liveCents = await metaManager.syncBudget(adSetId);
          const newCents  = Math.round(liveCents * f);
          await metaManager.updateBudget(adSetId, newCents, liveCents);
          const message = `Budget updated: $${(liveCents/100).toFixed(2)} → $${(newCents/100).toFixed(2)} (+${Math.round((f-1)*100)}%)`;
          responsePayload = { success: true, message, adSetId, adSetName: adSetName ?? adSetId, budgetFrom: liveCents, budgetTo: newCents };
          appendAuditEntry({
            timestamp: new Date().toISOString(), action: 'SCALE',
            adSetName: adSetName ?? adSetId, source,
            message, roas: null, budgetFrom: liveCents, budgetTo: newCents, reason: `Manual scale via UI`,
          });
          break;
        }
        case 'pause': {
          await metaManager.pauseAdSet(adSetId);
          const message = `"${adSetName ?? adSetId}" paused.`;
          responsePayload = { success: true, message, adSetId };
          appendAuditEntry({
            timestamp: new Date().toISOString(), action: 'PAUSE',
            adSetName: adSetName ?? adSetId, source,
            message, roas: null, budgetFrom: null, budgetTo: null, reason: 'Emergency pause via UI',
          });
          break;
        }
        case 'resume': {
          await metaManager.resumeAdSet(adSetId);
          const message = `"${adSetName ?? adSetId}" resumed and set to ACTIVE.`;
          responsePayload = { success: true, message, adSetId };
          appendAuditEntry({
            timestamp: new Date().toISOString(), action: 'RESUME',
            adSetName: adSetName ?? adSetId, source,
            message, roas: null, budgetFrom: null, budgetTo: null, reason: 'Manually resumed via UI',
          });
          break;
        }
        default:
          return res.status(400).json({ success: false, error: `Unknown action type: ${type}` });
      }

      return res.json(responsePayload);
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // ── POST /api/action ──────────────────────────────────────────────────────
  // Primary manual control endpoint. Body: { type, adSetId, adSetName, factor? }
  app.post('/api/action', handleManualAction);

  // ── POST /api/apply-action ────────────────────────────────────────────────
  // Alias kept for backward compatibility (AI recommendations panel).
  app.post('/api/apply-action', handleManualAction);

  // ── GET /api/action-log ───────────────────────────────────────────────────
  // Returns the last 5 audit entries for the Action Log panel on the home page.
  app.get('/api/action-log', (_req, res) => {
    const all    = loadAuditLog();
    const last5  = all.slice(-5).reverse().map(e => ({
      timestamp:  e.timestamp,
      action:     e.action,
      adSetName:  e.adSetName,
      source:     e.source ?? 'engine',
      message:    buildLogMessage(e),
      roas:       e.roas       ?? null,
      budgetFrom: e.budgetFrom ?? null,
      budgetTo:   e.budgetTo   ?? null,
    }));
    res.json({ entries: last5, total: all.length });
  });

  return app;
}

function start() {
  const app    = createServer();
  const server = app.listen(PORT, () => {
    console.log(`\n[ScaleAI API] Listening on http://localhost:${PORT}`);
    console.log(`[ScaleAI API]  GET  /api/health`);
    console.log(`[ScaleAI API]  GET  /api/mapping`);
    console.log(`[ScaleAI API]  GET  /api/status`);
    console.log(`[ScaleAI API]  GET  /api/live-feed`);
    console.log(`[ScaleAI API]  GET  /api/ai-recommendations`);
    console.log(`[ScaleAI API]  GET  /api/action-log`);
    console.log(`[ScaleAI API]  POST /api/action`);
    console.log(`[ScaleAI API]  POST /api/apply-action\n`);
  });
  return server;
}

module.exports = { start, createServer };
