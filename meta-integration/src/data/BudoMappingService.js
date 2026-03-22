'use strict';
const mapping = require('../config/productMapping.json');

// ─── Index the mapping for O(1) lookups ───────────────────────────────────────
const byAdSetId    = new Map(mapping.products.map(p => [p.metaAdSetId,   p]));
const byProductId  = new Map(mapping.products.map(p => [String(p.productId), p]));
const byMockKey    = new Map(mapping.products.map(p => [p.mockProductKey, p]));

/**
 * Look up the mapping record for a Meta ad set ID.
 * Returns null if this ad set has no registered Budo product.
 *
 * @param {string} adSetId
 * @returns {{ productId, productName, category, mockProductKey, metaAdSetId, metaAdSetName } | null}
 */
function getByAdSetId(adSetId) {
  return byAdSetId.get(adSetId) ?? null;
}

/**
 * Look up the mapping record for a Budo product ID.
 *
 * @param {number|string} productId
 * @returns {object|null}
 */
function getByProductId(productId) {
  return byProductId.get(String(productId)) ?? null;
}

/**
 * Resolve the exact inventory quantity for an ad set from a live inventory map.
 *
 * Uses the mapping's `mockProductKey` for a precise (non-fuzzy) lookup.
 * Falls back to null if the ad set has no Budo product mapping.
 *
 * @param {string}           adSetId
 * @param {Map<string,number>} inventoryMap   key = lowercase product name
 * @returns {number|null}
 */
function getInventory(adSetId, inventoryMap) {
  const record = getByAdSetId(adSetId);
  if (!record) return null;
  return inventoryMap.get(record.mockProductKey) ?? null;
}

/**
 * Returns all mapping pairs — used by the API status endpoint.
 *
 * @returns {Array<object>}
 */
function getAllPairs() {
  return mapping.products;
}

/**
 * Returns the set of Meta ad set IDs that have a Budo mapping.
 * The optimizer uses this to distinguish "mapped" from "unmapped" ad sets.
 *
 * @returns {Set<string>}
 */
function getMappedAdSetIds() {
  return new Set(byAdSetId.keys());
}

module.exports = { getByAdSetId, getByProductId, getInventory, getAllPairs, getMappedAdSetIds };
