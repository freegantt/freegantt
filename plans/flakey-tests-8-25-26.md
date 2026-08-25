# Flakiness Audit — e2e Browser Tests (8-25-26)

Audited all 9 Playwright tests across `e2e/harness.spec.ts`, `e2e/pane-resize.spec.ts`, and `e2e/scroll-sync.spec.ts`.

---

## Critical Flakiness Sources

### 1. `waitForTimeout` as the only synchronization — `scroll-sync.spec.ts`

Three tests use `page.waitForTimeout(100)` or `page.waitForTimeout(200)` as the sole guard after programmatic scroll writes. These are time-based, not condition-based — on a slow CI runner, 100 ms is not guaranteed to be enough for the React/observer tick to propagate. On a fast local machine they always pass, masking the race.

| Location | Wait | What it guards |
|---|---|---|
| `scroll-sync.spec.ts:26` | `100 ms` | Model-driven scroll propagation from `#tall` → `#short` |
| `scroll-sync.spec.ts:34` | `200 ms` | No echo feedback loop after propagation settles |
| `scroll-sync.spec.ts:56` | `100 ms` | Short chart pinned at max after overshoot scroll |
| `scroll-sync.spec.ts:67` | `100 ms` | Short chart resumed tracking after scrolling back under max |

**Fix**: Replace each `waitForTimeout` with a polling assertion (e.g. `expect.poll()`) or `page.waitForFunction()` that waits for the specific scroll position to stabilize.

### 2. Layout-dependent hit-test — `harness.spec.ts:72-86`

The `elementFromPoint` regression test depends on:
- The row named exactly `"Sprint 2"` being the last entry in the fixture dataset
- That row being scrolled into view after `scrollTop = scrollHeight`
- The grid pane's bounding box overlapping the row

If the fixture data changes (rows added/removed, renamed), or the row height CSS var (`--fg-row-height`) changes, or the pane height (`70vh`) changes, the hit-test coordinates shift and the assertion can produce a false failure. This test is correct *today* but brittle against fixture/layout edits.

**Fix**: Derive the hit-test target dynamically — find the last row in the DOM rather than hardcoding `'Sprint 2'`, and compute the hit point relative to whatever row is actually visible.

### 3. Content-sizer regex fragility — `pane-resize.spec.ts:14-22`

`contentSizerRight()` parses `sizer.style.transform` with the regex `/translate\(([\d.]+)px/`. This assumes:
- The transform is always a bare `translate(Npx)` — if the library ever adds a second translate, or uses `matrix()`, or writes the value in a different unit, the regex silently returns `NaN` and the test fails with an unhelpful message.
- The `+ 1` magic constant comes from a CSS-by-one-pixel convention that is easy to miss when reviewing changes.

**Fix**: Read a more durable signal — e.g. the sizer's `offsetWidth`, or expose a `data-content-width` attribute on the sizer element that the library sets directly.

---

## Moderate Flakiness Sources

### 4. `page.goto('/')` with no `waitForLoadState` — `harness.spec.ts`, `pane-resize.spec.ts`

Every test navigates to `/` and immediately reads DOM. Playwright defaults to `load` event, but the harness loads a `<script type="module">` which is parsed asynchronously. Under network latency the module may not have executed by the time the first locator fires.

The first test in each file masks this with `await expect(bars.first()).toBeVisible()` which implicitly waits, but the second/third tests in the same file rely on `page.goto('/')` at the top and then immediately read scroll/transform state without an explicit visible-element guard.

**Fix**: Add a common "page ready" guard after each `goto`:
```ts
await expect(page.locator('.fg-bar').first()).toBeVisible();
```
or use `await page.waitForLoadState('networkidle')`.

### 5. `setViewportSize` before `goto` — `pane-resize.spec.ts:38-39`

Two tests set viewport to 1000×800 then navigate. If the Vite dev server hasn't fully started yet (cold start), the navigation can land on a stale or partial page. Playwright's `webServer` config only checks that the HTTP port is reachable, not that HMR is ready.

**Minor risk** — usually masked by the `toBeVisible` guard on bars, but could cause sporadic failures on fresh CI.

### 6. No Playwright `retries` configured — `playwright.config.ts`

The Playwright config has no `retries` field, meaning zero retries on failure. A single transient timeout or layout jitter fails the whole run. This is not itself a source of flakiness, but it amplifies the impact of any flaky test.

### 7. Tolerance of 2 px in fitDataset assertions — `pane-resize.spec.ts:52, 77`

`expect(Math.abs(after - paneWidth)).toBeLessThan(2)` and the identical check on line 77 use a hardcoded 2 px tolerance. This is fine for the current implementation but can silently mask a 1 px off-by-one that grows to 3 px after a CSS change, causing a test that *should* fail to pass.

---

## Low-Severity Observations

### 8. No `test.describe.serial` — all test files

Tests in the same file are independent, which is good. But `pane-resize.spec.ts` drags a splitter in tests 2 and 3 — if Playwright ever runs them out of order (unlikely but possible with `fullyParallel: true`), the viewport state from a previous test could bleed over. Currently safe because each test calls `page.goto('/')`, but worth noting.

### 9. Hardcoded fixture data everywhere

The string `'Sprint 2'`, the row-count expectations, and the scroll-height calculations all assume the current fixture data (`fixtures/sample-project.ts`). Any change to the fixture dataset will cascade breakage into at least 4 of the 9 tests. Consider exporting the fixture row count and last-row name as constants the e2e tests import.

### 10. No `page.setViewportSize` reset between tests

`pane-resize.spec.ts` changes viewport size but never resets it. Playwright creates a fresh context per test by default, so this is not currently a problem — but if `test.describe` parallelism ever changes, stale viewport sizes could leak.

---

## Summary Table

| # | File | Severity | Issue | Current risk |
|---|---|---|---|---|
| 1 | `scroll-sync.spec.ts` | **High** | `waitForTimeout` instead of polling | Sporadic CI failures |
| 2 | `harness.spec.ts` | **High** | Hardcoded `'Sprint 2'` hit-test target | Breaks on fixture edit |
| 3 | `pane-resize.spec.ts` | **Medium** | Transform regex fragility | Breaks on sizer impl change |
| 4 | all | **Medium** | No load-state guard after `goto` | Rare module-load race |
| 5 | `pane-resize.spec.ts` | **Low** | Viewport set before goto | Cold-start race |
| 6 | `playwright.config.ts` | **Low** | No retries configured | Amplifies any flake |
| 7 | `pane-resize.spec.ts` | **Low** | 2 px tolerance | Could mask real regressions |
