import { test, expect } from '@playwright/test';

// S6 acceptance R4 (#403), the half a fake DOM cannot answer. `test/dom/leak-cycles.test.ts` counts
// listeners, observers and animation frames over 100 cycles in happy-dom. happy-dom keeps no
// detached-node accounting and no real listener table, so a node the browser would still hold is
// invisible there. Chromium's own `Performance.getMetrics` counts both, and this drives the same
// mount/destroy loop against it (#403 Q1: "observables and listeners in test:dom, node count in
// e2e").
//
// Cycles are deliberately modest here. A leak that survives 50 mounts survives 5,000; the count is
// chosen so this spec stays inside an ordinary e2e run rather than to be impressive.

const CYCLE_BUTTON_PRESSES = 2; // the page's own button runs 25 mount/destroy pairs per press

interface BrowserCensus {
  nodes: number;
  listeners: number;
  heapMb: number;
}

test('[S6-R4] repeated mount/destroy of a linked pair holds no nodes or listeners (#403)', async ({
  page,
  browserName,
}) => {
  // #317: `Performance.getMetrics` is a CDP method, and CDP itself is Chromium-only — this
  // census has no Firefox or WebKit equivalent, not a gap this spec can close.
  test.skip(browserName !== 'chromium', 'the node/listener census needs CDP, Chromium-only');

  await page.goto('/e2e/mount-destroy.html');
  await expect(page.locator('.fg-bar').first()).toBeVisible();

  const client = await page.context().newCDPSession(page);
  await client.send('Performance.enable');

  const census = async (): Promise<BrowserCensus> => {
    // A count taken while unreachable objects are still alive measures the collector's schedule,
    // not the library. Collect first, every time, so the two readings are taken the same way.
    await client.send('HeapProfiler.collectGarbage');
    const { metrics } = await client.send('Performance.getMetrics');
    const value = (name: string): number => metrics.find((metric) => metric.name === name)?.value ?? 0;
    return {
      nodes: value('Nodes'),
      listeners: value('JSEventListeners'),
      heapMb: value('JSHeapUsedSize') / (1024 * 1024),
    };
  };

  const cycle = page.getByTestId('cycle-pairs');
  const mountedPairs = page.getByTestId('cycle-count');

  // The baseline comes after a first round, never before the first mount (#403 Q2): the base
  // stylesheet and the page's own chrome land once and stay, and that is setup, not a leak.
  await cycle.click();
  await expect(mountedPairs).toHaveText(/26 pairs mounted so far/u);
  const baseline = await census();

  for (let press = 0; press < CYCLE_BUTTON_PRESSES; press++) await cycle.click();
  await expect(mountedPairs).toHaveText(/76 pairs mounted so far/u);

  const after = await census();

  // Equality would read the browser's own housekeeping as a leak — a lazily built font entry or an
  // internal cache can move a node count by a handful with nothing leaked. A leak is not a handful:
  // it is one Gantt's worth of nodes per mount, fifty times over. So the bar is "did not grow with
  // the cycles", and the slack is far smaller than a single mount would add.
  expect(after.nodes - baseline.nodes).toBeLessThan(20);
  expect(after.listeners - baseline.listeners).toBeLessThan(20);

  // Heap is the one question only a real browser can answer — happy-dom's own retention swamps it,
  // so `test/dom/leak-cycles.test.ts` does not ask. Measured on this page: 0.20 MB over 150 mounts.
  // The bar is 5 MB, an order of magnitude of headroom for an allocator's own noise, because a real
  // retention is a whole Gantt per mount and would pass this bar in the first handful of cycles.
  expect(after.heapMb - baseline.heapMb).toBeLessThan(5);
});

test('destroying a pair empties the containers it was handed', async ({ page }) => {
  await page.goto('/e2e/mount-destroy.html');
  await expect(page.locator('.fg-bar').first()).toBeVisible();

  await page.getByTestId('destroy-pair').click();
  await expect(page.locator('.fg-bar')).toHaveCount(0);

  // And the page still works afterwards: a destroyed Gantt is not a broken page.
  await page.getByTestId('mount-pair').click();
  await expect(page.locator('.fg-bar').first()).toBeVisible();
});
