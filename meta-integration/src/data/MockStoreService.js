'use strict';

// ─── Mock Product Catalog ─────────────────────────────────────────────────────
// These names should fuzzy-match your Meta ad set names so correlation works.
const PRODUCTS = [
  'Summer Collection',
  'Winter Sale',
  'Sports Gear',
  'Premium Footwear',
  'Accessories Bundle',
  'Electronics',
  'Home Decor',
  'Kids Collection',
];

const FUNNEL_STAGES = ['homepage', 'product-list', 'product-detail', 'cart', 'checkout'];
const BUG_PAGES     = ['checkout', 'product-detail', 'cart', 'landing'];

/**
 * MockStoreService — simulates a live e-commerce backend.
 *
 * Generates fresh random snapshots of:
 *   • Inventory levels per product
 *   • Site health (OK vs BUG_DETECTED on a specific page)
 *   • User drop-off rates per funnel stage
 *
 * Call `getSnapshot()` for a full correlated snapshot used by the optimizer.
 */
class MockStoreService {
  /**
   * Returns inventory as Map<productTitle (lowercase), stockQty>.
   *
   * Distribution (per product):
   *   15% → critical stock  (0–1 units)  → will trigger PAUSE
   *   20% → low stock       (2–9 units)  → edge zone
   *   65% → healthy stock  (10–99 units) → eligible for SCALE
   */
  getInventory() {
    const inventory = new Map();
    for (const product of PRODUCTS) {
      const r = Math.random();
      let stock;
      if (r < 0.15)      stock = Math.floor(Math.random() * 2);        // 0–1 critical
      else if (r < 0.35) stock = Math.floor(Math.random() * 8) + 2;    // 2–9 low
      else               stock = Math.floor(Math.random() * 90) + 10;  // 10–99 healthy
      inventory.set(product.toLowerCase(), stock);
    }
    return inventory;
  }

  /**
   * Returns site health snapshot.
   *   20% chance → BUG_DETECTED on a random page
   *   80% chance → OK
   *
   * @returns {{ status: 'OK'|'BUG_DETECTED', bugPage?: string }}
   */
  getSiteHealth() {
    if (Math.random() < 0.20) {
      const page = BUG_PAGES[Math.floor(Math.random() * BUG_PAGES.length)];
      return { status: 'BUG_DETECTED', bugPage: page };
    }
    return { status: 'OK' };
  }

  /**
   * Returns user drop-off rates per funnel stage.
   *   25% chance per stage → HIGH drop-off (bad)
   *   75% chance           → LOW drop-off  (good)
   *
   * @returns {Map<string, 'HIGH'|'LOW'>}
   */
  getDropOffRates() {
    const rates = new Map();
    for (const stage of FUNNEL_STAGES) {
      rates.set(stage, Math.random() < 0.25 ? 'HIGH' : 'LOW');
    }
    return rates;
  }

  /**
   * Returns estimated sales velocity as Map<productTitle (lowercase), unitsPerHour>.
   *
   * Distribution:
   *   10% → fast mover   (3–8 units/hour)
   *   40% → medium mover (1–3 units/hour)
   *   50% → slow mover   (0.1–1 units/hour)
   *
   * @returns {Map<string, number>}
   */
  getSalesVelocity() {
    const velocity = new Map();
    for (const product of PRODUCTS) {
      const r = Math.random();
      let rate;
      if (r < 0.10)      rate = Math.random() * 5   + 3;    // 3–8 units/hr  (fast)
      else if (r < 0.50) rate = Math.random() * 2   + 1;    // 1–3 units/hr  (medium)
      else               rate = Math.random() * 0.9 + 0.1;  // 0.1–1 units/hr (slow)
      velocity.set(product.toLowerCase(), Math.round(rate * 10) / 10);
    }
    return velocity;
  }

  /**
   * Full correlated snapshot — single call for the optimizer.
   *
   * @returns {{
   *   inventory:     Map<string, number>,
   *   siteHealth:    { status: string, bugPage?: string },
   *   dropOffRates:  Map<string, 'HIGH'|'LOW'>,
   *   salesVelocity: Map<string, number>
   * }}
   */
  getSnapshot() {
    const inventory     = this.getInventory();
    const siteHealth    = this.getSiteHealth();
    const dropOffRates  = this.getDropOffRates();
    const salesVelocity = this.getSalesVelocity();

    return { inventory, siteHealth, dropOffRates, salesVelocity };
  }

  /**
   * Human-readable summary of a snapshot (for logging).
   */
  summarize(snapshot) {
    const invLines = [...snapshot.inventory.entries()]
      .map(([p, q]) => {
        const vel = snapshot.salesVelocity?.get(p);
        const ets = (vel && vel > 0) ? ` (~${(q / vel).toFixed(1)}h ETS)` : '';
        return `  ${p}: ${q} units${ets}`;
      })
      .join('\n');

    const healthLine = snapshot.siteHealth.status === 'BUG_DETECTED'
      ? `BUG_DETECTED on /${snapshot.siteHealth.bugPage}`
      : 'OK';

    const dropLines = [...snapshot.dropOffRates.entries()]
      .filter(([, v]) => v === 'HIGH')
      .map(([stage]) => stage);

    return [
      `Site Health : ${healthLine}`,
      `Inventory   :\n${invLines}`,
      `High Drop-off stages: ${dropLines.length ? dropLines.join(', ') : 'none'}`,
    ].join('\n');
  }
}

module.exports = new MockStoreService(); // singleton — consistent per process lifetime
