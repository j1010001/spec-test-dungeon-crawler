import { defineConfig } from '@playwright/test';

// Runs the User Story 6 smoke suite against the shipped inlined artifact
// (index.html) over file:// — no server, no build at test time.
export default defineConfig({
  testDir: './tests-e2e',
  timeout: 30_000,
  fullyParallel: true,
  reporter: [['list']],
  use: {
    browserName: 'chromium',
  },
});
