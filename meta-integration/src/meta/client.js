'use strict';
const bizSdk = require('facebook-nodejs-business-sdk');
const { config } = require('../config');

const api = bizSdk.FacebookAdsApi.init(config.META_ACCESS_TOKEN);

if (process.env.NODE_ENV !== 'production') {
  api.setDebug(false); // set true to see raw HTTP calls in dev
}

module.exports = bizSdk;
