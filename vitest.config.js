import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.js'], // tests-e2e/ belongs to Playwright
    environment: 'node',
  },
});
