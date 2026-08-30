import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  // A single transient timeout or layout jitter should not fail the whole run; retry once
  // locally, twice on CI where runners are slower and noisier.
  retries: process.env['CI'] ? 2 : 1,
  webServer: {
    // e2e runs on its own port (5172) so it never silently reuses the human dev server on the
    // default 5173 — a stale `pnpm dev` from this clone or another would otherwise serve the
    // wrong codebase and give a false green. --strictPort makes an unexpected occupant loud.
    command: 'vite --port 5172 --strictPort',
    url: 'http://localhost:5172',
    reuseExistingServer: !process.env['CI'],
  },
  use: {
    baseURL: 'http://localhost:5172',
    // Tall enough that the harness page (nav + toolbar + #gantt's 70vh) fits inside the viewport
    // at Playwright's implicit default (1280x720) it does not — a test that hit-tests painted
    // pixels then fails not because anything is mispainted, but because part of the page sits
    // below the fold and the browser never scrolled the window to reveal it. A test that needs a
    // different size (e.g. pane-resize.spec.ts's resize assertions) still calls setViewportSize.
    viewport: { width: 1280, height: 1100 },
  },
});
