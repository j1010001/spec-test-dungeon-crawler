import { defineConfig } from 'vitest/config';

// Playwright integration suite (`npm run test:integration`) — runs the
// committed /index.html artifact via file:// in headless Chromium (US6).
// Requires: npx playwright install chromium
export default defineConfig({
  test: {
    include: ['tests/integration/**/*.test.js'],
    testTimeout: 60000,
    hookTimeout: 60000,
    fileParallelism: false,
  },
});
