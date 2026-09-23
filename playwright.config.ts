import { defineConfig } from '@playwright/test';

const PORT = process.env['FG_E2E_PORT'] ?? '5172';

export default defineConfig({
  testDir: './e2e',
  // The push gate (`verify:full`, pre-push) and CI both call `pnpm test:e2e`, which pins
  // `--project=chromium` (#317): three engines would triple the gate's runtime for a check
  // that already covers the acceptance boxes happy-dom cannot see. Firefox and WebKit run
  // through `pnpm test:e2e:engines`, by hand, until a CI home for them is decided.
  //
  // Each project sets only `browserName`, not a Playwright device preset (`devices['Desktop
  // Firefox']` etc). A device preset carries its own `viewport`, and that would silently
  // override the `use.viewport` below per engine — the harness page needs the same 1280x1100
  // in every engine, not whatever a marketing device profile ships.
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'firefox', use: { browserName: 'firefox' } },
    { name: 'webkit', use: { browserName: 'webkit' } },
  ],
  // A single transient timeout or layout jitter should not fail the whole run; retry once
  // locally, twice on CI where runners are slower and noisier.
  retries: process.env['CI'] ? 2 : 1,
  // Playwright defaults to one worker on CI, and that default was costing more than the whole
  // rest of the gate: 128.8s of a 283s run, single-threaded, while `pnpm verify`'s fifteen checks
  // took 154s between them. Two workers, because the runner has two cores — a third would only
  // time-slice the same cores and lengthen the tail. Parallelism is per spec *file* (there is no
  // `fullyParallel` here), and 30 files distribute over two workers with room to spare, so the
  // file count is not the cap. Locally the default stands: Playwright already picks half the
  // cores, which is the right answer on a developer machine.
  //
  // Watch `retries` above if this goes flaky. Two browsers on two cores, beside a Vite dev server,
  // is real contention, and the timing-sensitive specs (drag, resize, scroll-sync) feel it first.
  // A rising retry count is the signal to drop back to one worker, not to raise the timeouts.
  ...(process.env['CI'] ? { workers: 2 } : {}),
  // #257: refuses the whole run when the webServer plugin (below) is about to reuse — or just
  // did reuse — a dev server that belongs to a different worktree of this repo. Runs before any
  // spec, after the webServer decision is already made, so it cannot prevent the reuse, only stop
  // a test from ever seeing the wrong worktree's page. See the script for why the check lives here.
  globalSetup: './scripts/e2e-worktree-port-guard.mjs',
  webServer: {
    // e2e runs on its own port (5172 by default) so it never silently reuses the human dev server on
    // the default 5173 — a stale `pnpm dev` from this clone or another would otherwise serve the
    // wrong codebase and give a false green. --strictPort makes an unexpected occupant loud.
    //
    // `reuseExistingServer` reopens that same hole between two *worktrees* of this repo: a second
    // checkout already serving 5172 is reused silently, and every spec then runs against the other
    // worktree's code. `FG_E2E_PORT` is how a worktree claims a port of its own — set it once per
    // checkout and the guard above holds again.
    command: `vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env['CI'],
  },
  use: {
    baseURL: `http://localhost:${PORT}`,
    // Tall enough that the harness page (nav + toolbar + #gantt's 70vh) fits inside the viewport
    // at Playwright's implicit default (1280x720) it does not — a test that hit-tests painted
    // pixels then fails not because anything is mispainted, but because part of the page sits
    // below the fold and the browser never scrolled the window to reveal it. A test that needs a
    // different size (e.g. pane-resize.spec.ts's resize assertions) still calls setViewportSize.
    viewport: { width: 1280, height: 1100 },
  },
});
