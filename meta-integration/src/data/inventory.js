'use strict';
const fs    = require('fs');
const path  = require('path');
const axios = require('axios');
const { config } = require('../config');

/**
 * Parse a CSV file with columns: product,inventory
 * @returns {Map<string, number>}
 */
function parseCSV(filePath) {
  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) {
    console.warn(`[Inventory] CSV not found at ${abs}. Using empty inventory.`);
    return new Map();
  }
  const lines = fs.readFileSync(abs, 'utf8').trim().split(/\r?\n/);
  const map = new Map();
  for (let i = 1; i < lines.length; i++) {  // skip header
    const [product, qty] = lines[i].split(',').map(s => s.trim());
    if (product && qty !== undefined) {
      map.set(product.toLowerCase(), parseInt(qty, 10));
    }
  }
  return map;
}

/**
 * Fetch inventory from Shopify Admin REST API.
 * Returns Map<productTitle (lower), totalInventory>
 * @returns {Promise<Map<string, number>>}
 */
async function fetchShopify() {
  const map = new Map();
  let url = `${config.SHOPIFY_STORE_URL}/admin/api/2024-01/products.json?limit=250&fields=title,variants`;

  while (url) {
    const res = await axios.get(url, {
      headers: { 'X-Shopify-Access-Token': config.SHOPIFY_ACCESS_TOKEN },
    });
    for (const product of res.data.products) {
      const total = product.variants.reduce((sum, v) => sum + (v.inventory_quantity || 0), 0);
      map.set(product.title.toLowerCase(), total);
    }
    // Handle Shopify pagination via Link header
    const link = res.headers['link'] || '';
    const next = link.match(/<([^>]+)>;\s*rel="next"/);
    url = next ? next[1] : null;
  }
  return map;
}

/**
 * Main exported function — source is determined by INVENTORY_SOURCE env var.
 * @returns {Promise<Map<string, number>>}
 */
async function getInventory() {
  if (config.INVENTORY_SOURCE === 'shopify') {
    return fetchShopify();
  }
  return parseCSV(config.INVENTORY_CSV_PATH);
}

module.exports = { getInventory };
