import { defineConfig } from '@playwright/test';

// Integration suite per User Story 6 / SC-008: runs against the COMMITTED
// inlined index.html at the repo root, loaded via file:// — no server.
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  fullyParallel: true,
  reporter: [['list']],
  use: {
    browserName: 'chromium',
    headless: true,
  },
});
