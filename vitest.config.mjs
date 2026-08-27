import { defineConfig } from 'vitest/config';

// Unit/logic suite (`npm test`). The Playwright artifact suite lives in
// tests/integration and runs separately via `npm run test:integration`.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.js'],
    exclude: ['tests/integration/**', 'node_modules/**'],
    setupFiles: ['tests/setup.js'],
  },
});
