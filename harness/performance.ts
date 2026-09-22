// The perf demo (plans/02 §5, S7): can this library carry a real-world-sized Dataset without a
// consumer doing anything special? One Dataset of 50,000 seeded entries, with the build and
// first-paint cost read back onto the page, and the rendered `.fg-row`/`.fg-bar` count proving the
// DOM never holds more than the viewport shows. A second, shorter chart shares the first one's
// time axis and horizontal scroll position — panning either one pans both.
//
// Merges three retired fixtures: `harness/e2e/large-dataset.ts` (a seeded Dataset at
// `fit: 'preset'`), `harness/e2e/dense-tile-grid.ts` (the case for windowing) and
// `harness/e2e/scroll-sync.ts` (two Gantts sharing one `TimeScaleModel`/`ScrollAxis` pair).

import './harness-nav.ts';
import { Gantt, Dataset, TimeScaleModel, ScrollAxis } from 'freegantt';
import { seededEntryInputs } from '../fixtures/seeded-dataset.js';
import { mountGanttToolbar } from './gantt-toolbar.js';
import { mountPageBrief } from './docs/page-brief.js';

mountPageBrief(document.querySelector<HTMLDivElement>('#page-brief')!, 'performance');

// How many entries? `?count=` in the URL, or the page's own headline number.
const DEFAULT_ENTRY_COUNT = 50_000;

function entryCountFromQuery(): number {
  const raw = new URLSearchParams(window.location.search).get('count');
  const parsed = raw === null ? NaN : Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_ENTRY_COUNT;
}

const entryCount = entryCountFromQuery();

// How long does a Dataset this size take to build? `performance.now()` around the constructor
// call, nothing more — the number reported is the library's own build cost, not a re-derivation.
const buildStart = performance.now();
const dataset = new Dataset({ entries: seededEntryInputs({ count: entryCount }), timeZone: 'UTC' });
const buildMs = performance.now() - buildStart;

// One time axis and one horizontal scroll position, shared by the main chart and the overview
// below it (plans/02 §5: "Shared axes and scroll"). `fit: 'preset'` keeps the content wider than
// either pane, so both the horizontal scroll and the virtualization it drives are observable.
const scale = new TimeScaleModel({ fit: 'preset' });
const sharedX = new ScrollAxis();

const paintStart = performance.now();
const gantt = new Gantt({
  container: '#gantt',
  dataset,
  scale,
  scroll: { x: sharedX },
  a11yLabel: 'Performance Gantt',
});

mountGanttToolbar({ gantt, container: document.querySelector<HTMLDivElement>('#toolbar')! });

// The overview: the same Dataset and the same time axis, a shorter pane, only `x` shared. Its own
// row window stays private (a second `y`), so its far-fewer visible rows never clamp the main
// chart's scroll range (D-S6-1).
new Gantt({
  container: '#overview-gantt',
  dataset,
  scale,
  scroll: { x: sharedX },
  a11yLabel: 'Overview Gantt',
});

declare global {
  interface Window {
    __gantt: Gantt;
  }
}
window.__gantt = gantt;

// The statusbar: what did building and first-painting this Dataset cost, and how much of it is
// actually in the DOM right now?
const buildReadout = document.querySelector<HTMLSpanElement>('#build-readout')!;
const paintReadout = document.querySelector<HTMLSpanElement>('#paint-readout')!;
const countReadout = document.querySelector<HTMLSpanElement>('#count-readout')!;
const renderedReadout = document.querySelector<HTMLSpanElement>('#rendered-readout')!;

buildReadout.innerHTML = `Dataset build: <b>${buildMs.toFixed(1)} ms</b>`;
countReadout.innerHTML = `Entries: <b>${dataset.entries.all.length.toLocaleString()}</b>`;

// First paint: the constructor above only requests a render (D-S2-15); the browser paints it on
// the next animation frame, so that is where the clock stops.
requestAnimationFrame(() => {
  const paintMs = performance.now() - paintStart;
  paintReadout.innerHTML = `First paint: <b>${paintMs.toFixed(1)} ms</b>`;
});

// How many `.fg-row`/`.fg-bar` nodes does the DOM hold? Re-read on every navigation change (pan,
// zoom, scroll), rAF-throttled so a fast scroll that fires many events still measures the DOM at
// most once a frame.
let measureQueued = false;

function updateRenderedCount(): void {
  const ganttEl = document.querySelector('#gantt')!;
  const rows = ganttEl.querySelectorAll('.fg-row').length;
  const bars = ganttEl.querySelectorAll('.fg-bar').length;
  renderedReadout.innerHTML = `Rendered: <b>${rows} rows / ${bars} bars</b>`;
}

function queueRenderedCountUpdate(): void {
  if (measureQueued) return;
  measureQueued = true;
  requestAnimationFrame(() => {
    measureQueued = false;
    updateRenderedCount();
  });
}

gantt.on('navigationChange', queueRenderedCountUpdate);
queueRenderedCountUpdate();

// The dataset-size picker: which count is on screen right now, and a reload for each other one.
const countPicker = document.querySelector<HTMLDivElement>('#count-picker')!;
countPicker.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
  const buttonCount = Number(button.dataset['count']);
  button.setAttribute('aria-pressed', String(buttonCount === entryCount));
  button.addEventListener('click', () => {
    window.location.search = `?count=${buttonCount}`;
  });
});
