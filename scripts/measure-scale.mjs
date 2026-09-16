// S6 R1/R2 (#95, #406): the measured spike D2 asks for, run on demand.
//
// **This is a measurement, not a gate.** It prints numbers and always exits 0 on a completed run.
// #95 is explicit that a CI test which fails on frame time is a flaky proxy, and that budgets wait
// until S6 names them on known hardware. So nothing here asserts, and `pnpm verify` does not call
// it. Run it, read the numbers, and put them in the issue.
//
// What it cannot do, from #95's own list — a human with the Performance panel still has to read the
// trace this writes:
//   - A scripted `scrollTop` write is not a real wheel or trackpad scroll.
//   - A headless run is not reference hardware, and neither is a laptop.
//   - Which call stacks are ours, whether a layout was forced, whether paint is the bottleneck —
//     that is panel work, and the trace file exists so a person can do it.
//
// Usage:  pnpm measure:scale            (add --headed to watch it)
// Output: a summary table, and a Chromium trace under measurements/.

import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const PORT = process.env['FG_MEASURE_PORT'] ?? '5174';
const ORIGIN = `http://localhost:${PORT}`;
const PAGE = '/large-dataset.html';
const OUT_DIR = 'measurements';
/** Enough motion to see a pattern rather than one lucky frame — #95 asks for seconds of scrolling,
 *  not a single flick. */
const SCROLL_STEPS = 240;
const STEP_PX = 40;
/** #95 step 5. Four times slower than this machine, so jank a fast laptop hides becomes visible. */
const CPU_THROTTLE = 4;

/** Waits for the dev server by asking it for the page, because a port that accepts a socket is not
 *  yet a server that serves modules. */
async function waitForServer(url, attempts = 100) {
  for (let i = 0; i < attempts; i++) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Not up yet. The loop is the wait.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`measure:scale: no dev server answered at ${url}`);
}

/** Refuses a port something else already answers on.
 *
 *  Without this the run is silently wrong rather than loudly broken: `--strictPort` makes vite fail,
 *  the script carries on, and every number comes from whatever server was already there — a stale
 *  one from the last run, or another worktree's. That is the same false green
 *  `scripts/e2e-worktree-port-guard.mjs` exists to refuse, and it cost one bad measurement here
 *  before this check was written. */
async function refuseOccupiedPort() {
  try {
    await fetch(ORIGIN, { signal: AbortSignal.timeout(1000) });
  } catch {
    return; // Nothing answered. The port is ours.
  }
  throw new Error(
    `measure:scale: something already answers on ${ORIGIN}. Stop it, or set FG_MEASURE_PORT to a free port.`,
  );
}

/** Its own process group, so killing it takes the whole `npx` → `vite` chain down. Killing the
 *  `npx` process alone leaves vite holding the port, which is how the stale server above happened. */
function startDevServer() {
  return spawn('npx', ['vite', '--port', PORT, '--strictPort'], {
    stdio: ['ignore', 'ignore', 'inherit'],
    detached: true,
  });
}

function stopDevServer(child) {
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    child.kill('SIGTERM');
  }
}

/** p50/p95/max of a frame-time sample, plus how many frames missed.
 *
 *  **Read p50 with care.** These are animation-frame intervals, so an unthrottled run on a machine
 *  with headroom reports ~16.7 ms whatever the work costs — that is the display's cadence, not
 *  ours. The tail is where the work shows: `p95`, `max`, and `dropped` (over 32 ms, so at least one
 *  frame missed). The throttled pass below is what turns the median into a cost as well. */
function percentiles(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const at = (fraction) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
  return {
    p50: at(0.5),
    p95: at(0.95),
    max: sorted[sorted.length - 1],
    dropped: sorted.filter((ms) => ms > 32).length,
    frames: sorted.length,
  };
}

/** One line per pass: the tail first, because the tail is the part a person feels. */
function reportPass(label, stats) {
  report(
    label,
    `${stats.p50.toFixed(1)} / ${stats.p95.toFixed(1)} / ${stats.max.toFixed(1)}  (${stats.dropped}/${stats.frames} over 32ms)`,
  );
}

/** Scrolls one axis for `steps` frames and answers the time each frame took. The wait is an
 *  animation frame, never a sleep: a sleep measures the sleep. */
const scrollAndTime = ({ axis, steps, stepPx }) => {
  const pane = document.querySelector('.fg-timeline-pane');
  if (!pane) throw new Error('no .fg-timeline-pane on this page');
  const frames = [];
  let previous = performance.now();
  const step = () =>
    new Promise((resolve) => {
      if (axis === 'y') pane.scrollTop += stepPx;
      else pane.scrollLeft += stepPx;
      pane.dispatchEvent(new Event('scroll'));
      requestAnimationFrame(() => {
        const now = performance.now();
        frames.push(now - previous);
        previous = now;
        resolve();
      });
    });
  return (async () => {
    for (let i = 0; i < steps; i++) await step();
    return frames;
  })();
};

async function readMetrics(client) {
  const { metrics } = await client.send('Performance.getMetrics');
  const value = (name) => metrics.find((metric) => metric.name === name)?.value ?? 0;
  return {
    nodes: value('Nodes'),
    listeners: value('JSEventListeners'),
    documents: value('Documents'),
    layoutCount: value('LayoutCount'),
    recalcStyleCount: value('RecalcStyleCount'),
    scriptDurationMs: value('ScriptDuration') * 1000,
    taskDurationMs: value('TaskDuration') * 1000,
    heapUsedMb: value('JSHeapUsedSize') / (1024 * 1024),
  };
}

function report(label, value) {
  const shown = typeof value === 'number' ? value.toFixed(value >= 100 ? 0 : 2) : String(value);
  console.log(`  ${label.padEnd(34)} ${shown}`);
}

async function main() {
  const headed = process.argv.includes('--headed');
  await mkdir(OUT_DIR, { recursive: true });
  await refuseOccupiedPort();
  const server = startDevServer();
  const browser = await chromium.launch({ headless: !headed });

  try {
    await waitForServer(`${ORIGIN}${PAGE}`);
    const page = await browser.newPage({ viewport: { width: 1280, height: 1100 } });
    const client = await page.context().newCDPSession(page);
    await client.send('Performance.enable');

    const mountStarted = Date.now();
    await page.goto(`${ORIGIN}${PAGE}`);
    await page.locator('[data-testid="fg-row"]').first().waitFor();
    const mountMs = Date.now() - mountStarted;

    // The page states its own size. Reading it here rather than hard-coding 5,000 or 10,000 is what
    // keeps this honest while #406 is open — a number measured at the wrong count discharges nothing.
    const scale = await page.evaluate(() => ({
      rowsInDom: document.querySelectorAll('[data-testid="fg-row"]').length,
      barsInDom: document.querySelectorAll('.fg-bar').length,
      pageTitle: document.title,
    }));

    const timestamp = new Date().toISOString().replace(/[:.]/gu, '-');
    const tracePath = `${OUT_DIR}/${timestamp}-scroll-trace.json`;
    await browser.startTracing(page, { path: tracePath, screenshots: false });

    const before = await readMetrics(client);
    const verticalFrames = await page.evaluate(scrollAndTime, {
      axis: 'y',
      steps: SCROLL_STEPS,
      stepPx: STEP_PX,
    });
    const horizontalFrames = await page.evaluate(scrollAndTime, {
      axis: 'x',
      steps: SCROLL_STEPS,
      stepPx: STEP_PX,
    });
    const after = await readMetrics(client);

    // #95 step 5: the same scroll at 4x CPU slowdown, so a machine with headroom still shows where
    // the work is. A laptop that never drops a frame unthrottled tells you nothing about a
    // dispatcher's four-year-old office desktop.
    await client.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE });
    const throttledBefore = await readMetrics(client);
    const throttledFrames = await page.evaluate(scrollAndTime, {
      axis: 'y',
      steps: SCROLL_STEPS,
      stepPx: -STEP_PX,
    });
    const throttledAfter = await readMetrics(client);
    await client.send('Emulation.setCPUThrottlingRate', { rate: 1 });

    await browser.stopTracing();

    // A heap reading means nothing while unreachable objects are still counted, so collect first.
    await client.send('HeapProfiler.collectGarbage');
    const settled = await readMetrics(client);

    const vertical = percentiles(verticalFrames);
    const horizontal = percentiles(horizontalFrames);
    const throttled = percentiles(throttledFrames);
    /** Script milliseconds per animation frame. The delta spans every frame it covers, so the
     *  divisor is every frame in those passes — one pass's frame count would read four times high. */
    const scriptPerFrame = (metricsAfter, metricsBefore, ...passes) =>
      (metricsAfter.scriptDurationMs - metricsBefore.scriptDurationMs) /
      passes.reduce((total, pass) => total + pass.frames, 0);

    console.log(`\nFreeGantt scale measurement — ${PAGE}`);
    console.log(`  ${new Date().toISOString()} · headless=${!headed} · node ${process.version}\n`);
    console.log('Fixture');
    report('page', scale.pageTitle);
    report('rows in the DOM', scale.rowsInDom);
    report('bars in the DOM', scale.barsInDom);
    report('mount to first row (ms)', mountMs);
    console.log('\nFrame time during scroll — p50 / p95 / max in ms');
    reportPass('vertical', vertical);
    reportPass('horizontal', horizontal);
    reportPass(`vertical at ${CPU_THROTTLE}x CPU slowdown`, throttled);
    console.log('\nCost of the scroll');
    report('script per frame, no throttle (ms)', scriptPerFrame(after, before, vertical, horizontal));
    report(
      `script per frame, ${CPU_THROTTLE}x (ms)`,
      scriptPerFrame(throttledAfter, throttledBefore, throttled),
    );
    report('script total (ms)', after.scriptDurationMs - before.scriptDurationMs);
    report('task total (ms)', after.taskDurationMs - before.taskDurationMs);
    report('layouts', after.layoutCount - before.layoutCount);
    report('style recalcs', after.recalcStyleCount - before.recalcStyleCount);
    console.log('\nHeld after scroll, once garbage is collected');
    report('DOM nodes', settled.nodes);
    report('JS event listeners', settled.listeners);
    report('JS heap used (MB)', settled.heapUsedMb);
    console.log(`\nTrace for the Performance panel: ${tracePath}`);
    console.log('A number here is this machine, not reference hardware. Say which machine in the issue.\n');

    await writeFile(
      `${OUT_DIR}/${timestamp}-summary.json`,
      `${JSON.stringify(
        {
          page: PAGE,
          scale,
          mountMs,
          cpuThrottle: CPU_THROTTLE,
          vertical,
          horizontal,
          throttled,
          before,
          after,
          settled,
        },
        undefined,
        2,
      )}\n`,
    );
  } finally {
    await browser.close();
    stopDevServer(server);
  }
}

await main();
