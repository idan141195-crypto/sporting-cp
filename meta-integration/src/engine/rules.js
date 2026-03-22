'use strict';

// ─── ScaleAI Decision Thresholds ─────────────────────────────────────────────
const ROAS_SCALE           = 5.0;  // ROAS above this → scale budget up
const ROAS_PAUSE           = 3.0;  // ROAS below this → pause immediately
const INVENTORY_PAUSE      = 2;    // Units below this → pause (critically low stock)
const INVENTORY_SCALE      = 10;   // Units must be ABOVE this to allow scaling
const SCALE_FACTOR         = 1.15; // Budget multiplier when scaling (+15%)
const ETS_SOFT_PAUSE_HOURS = 6;    // If stockout in < 6h, hold scaling to extend runway

/**
 * Fuzzy match an ad set name against inventory product titles.
 * Returns stock quantity or null if no product matched.
 *
 * @param {string} adSetName
 * @param {Map<string, number>} inventory  key = lowercase product title
 * @returns {number|null}
 */
function resolveStock(adSetName, inventory) {
  const name = adSetName.toLowerCase();
  for (const [product, qty] of inventory.entries()) {
    if (name.includes(product) || product.includes(name)) {
      return qty;
    }
  }
  return null;
}

/**
 * Determine whether the checkout funnel has a HIGH drop-off problem.
 * Returns true if cart or checkout stage is HIGH (signals poor conversion).
 *
 * @param {Map<string, 'HIGH'|'LOW'>} dropOffRates
 * @returns {boolean}
 */
function hasCriticalDropOff(dropOffRates) {
  if (!dropOffRates) return false;
  return dropOffRates.get('checkout') === 'HIGH' || dropOffRates.get('cart') === 'HIGH';
}

/**
 * Pure decision function — no side effects, no I/O.
 *
 * Priority order:
 *  1. Site health  — BUG_DETECTED or RED → pause everything
 *  2. Inventory    — critically low (< INVENTORY_PAUSE) → pause
 *  3. No spend     — skip, don't make blind decisions
 *  4. ROAS + inventory gate for scaling
 *  5. Low ROAS     → pause
 *  6. High drop-off at cart/checkout → hold even if ROAS looks good
 *
 * @param {{ adSetId, adSetName, roas, spend }} insight
 * @param {Map<string, number>} inventory
 * @param {{ status: 'OK'|'BUG_DETECTED', bugPage?: string }} siteHealth
 * @param {Map<string, 'HIGH'|'LOW'>} [dropOffRates]
 * @param {number|null} [etsHours]  Estimated hours to stockout (null = unknown)
 * @returns {{ action: 'SCALE'|'PAUSE'|'HOLD', reason: string, factor?: number }}
 */
function decide(insight, inventory, siteHealth, dropOffRates, etsHours) {
  const status = (siteHealth && siteHealth.status) ? siteHealth.status : siteHealth;

  // ── 1. Site health overrides everything ──────────────────────────────────
  if (status === 'BUG_DETECTED' || status === 'RED') {
    const detail = siteHealth.bugPage ? ` (page: /${siteHealth.bugPage})` : '';
    return { action: 'PAUSE', reason: `Site health: ${status}${detail}` };
  }

  // ── 2. Inventory: pause if critically low ─────────────────────────────────
  const stock = resolveStock(insight.adSetName, inventory);
  if (stock !== null && stock < INVENTORY_PAUSE) {
    return {
      action: 'PAUSE',
      reason: `Critical inventory: ${stock} units < ${INVENTORY_PAUSE} (pause threshold)`,
    };
  }

  // ── 3. No spend data today — hold, don't make blind decisions ─────────────
  if (!insight.spend || insight.spend === 0) {
    return { action: 'HOLD', reason: 'No spend data yet today' };
  }

  // ── 4. Low ROAS → pause ───────────────────────────────────────────────────
  if (insight.roas < ROAS_PAUSE) {
    return {
      action: 'PAUSE',
      reason: `ROAS ${insight.roas.toFixed(2)} < ${ROAS_PAUSE} (break-even threshold)`,
    };
  }

  // ── 5. High ROAS + sufficient inventory + no funnel issues → scale ────────
  if (insight.roas > ROAS_SCALE) {
    // Inventory gate: must have > INVENTORY_SCALE units to justify scaling
    if (stock !== null && stock <= INVENTORY_SCALE) {
      return {
        action: 'HOLD',
        reason: `ROAS ${insight.roas.toFixed(2)} qualifies for scale but inventory too low (${stock} ≤ ${INVENTORY_SCALE} units)`,
      };
    }

    // Funnel gate: don't pour money in if checkout/cart is leaking
    if (hasCriticalDropOff(dropOffRates)) {
      return {
        action: 'HOLD',
        reason: `ROAS ${insight.roas.toFixed(2)} qualifies for scale but HIGH drop-off at cart/checkout`,
      };
    }

    // ETS Soft-Pause gate: don't scale if stockout is imminent (< 6 hours)
    if (etsHours !== null && etsHours !== undefined && etsHours < ETS_SOFT_PAUSE_HOURS) {
      return {
        action: 'HOLD',
        reason: `ROAS ${insight.roas.toFixed(2)} qualifies for scale but stockout in ~${etsHours.toFixed(1)}h — holding to extend inventory runway`,
      };
    }

    return {
      action:  'SCALE',
      reason:  `ROAS ${insight.roas.toFixed(2)} > ${ROAS_SCALE} AND inventory ${stock !== null ? stock : 'N/A'} > ${INVENTORY_SCALE} → +15% budget`,
      factor:  SCALE_FACTOR,
    };
  }

  // ── 6. ROAS in optimize range — hold ─────────────────────────────────────
  return {
    action: 'HOLD',
    reason: `ROAS ${insight.roas.toFixed(2)} in optimize range (${ROAS_PAUSE}–${ROAS_SCALE})`,
  };
}

module.exports = {
  decide,
  resolveStock,
  hasCriticalDropOff,
  ROAS_SCALE,
  ROAS_PAUSE,
  INVENTORY_PAUSE,
  INVENTORY_SCALE,
  SCALE_FACTOR,
  ETS_SOFT_PAUSE_HOURS,
};
