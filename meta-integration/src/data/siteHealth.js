'use strict';
const axios = require('axios');
const { config } = require('../config');

/**
 * Check site health status.
 * Expects endpoint to return JSON: { "status": "GREEN" | "RED" }
 * Falls back to HTTP status code: 2xx = GREEN, else RED.
 * If SITE_HEALTH_URL is not configured, returns GREEN (skip check).
 *
 * @returns {Promise<"GREEN"|"RED">}
 */
async function checkSiteHealth() {
  if (!config.SITE_HEALTH_URL) {
    return 'GREEN';
  }

  try {
    const res = await axios.get(config.SITE_HEALTH_URL, { timeout: 8000 });

    // Try to read status field from JSON body
    if (res.data && typeof res.data.status === 'string') {
      const status = res.data.status.toUpperCase();
      if (status === 'RED' || status === 'GREEN') return status;
    }

    // Fallback: HTTP 2xx = GREEN
    return res.status >= 200 && res.status < 300 ? 'GREEN' : 'RED';
  } catch (err) {
    // Request failed (timeout, 5xx, network) → treat as RED
    console.error(`[SiteHealth] Check failed: ${err.message} → treating as RED`);
    return 'RED';
  }
}

module.exports = { checkSiteHealth };
