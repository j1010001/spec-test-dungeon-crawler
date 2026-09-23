// @ts-check
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  testMatch: /.*\.test\.js$/,
  timeout: 30000,
  reporter: 'list',
  use: { browserName: 'chromium', headless: true, viewport: { width: 1280, height: 800 } },
});
