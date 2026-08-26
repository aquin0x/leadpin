const { join } = require('path');

/**
 * @type {import("puppeteer").Configuration}
 */
module.exports = {
  // Changes the cache location for Puppeteer.
  // Container'da Chrome /opt/puppeteer altına kurulur (PUPPETEER_CACHE_DIR ile
  // verilir); geliştirme makinesinde repo içindeki .cache/puppeteer kullanılır.
  cacheDirectory: process.env.PUPPETEER_CACHE_DIR || join(__dirname, '.cache', 'puppeteer'),
};
