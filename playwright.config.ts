import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  // A single transient timeout or layout jitter should not fail the whole run; retry once
  // locally, twice on CI where runners are slower and noisier.
  retries: process.env['CI'] ? 2 : 1,
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env['CI'],
  },
  use: {
    baseURL: 'http://localhost:5173',
  },
});
