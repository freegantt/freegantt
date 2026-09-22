// ADR 0029: the app pushes the theme; the library never asks. This page demos both push recipes
// the ADR names, off one toggle:
//
// 1. `gantt.theme = isDark ? 'dark' : 'light'` — the app writes the answer straight onto the Gantt
//    it already owns, the same line the app's own dark-mode toggle already runs.
// 2. `data-fg-theme` on a wrapper — the app pins the attribute once on an ancestor, and a Gantt
//    inside it on `theme: 'auto'` follows with no assignment of its own.
//
// Neither Gantt below ever reads the `dark` class on `<html>` — that class is this page's own
// app-level signal, the thing Tailwind/Filament/next-themes already write. The library only ever
// sees what the toggle pushes onto it.
//
// `e2e/theme-push.spec.ts` drives this page: it clicks the toggle and checks both Gantts follow.

import { Gantt, Dataset } from 'freegantt';
import { sampleEntryInputs } from '../../fixtures/sample-dataset.js';

declare global {
  interface Window {
    __gantt: Gantt;
    /** Two Gantts on this page, so this second global names the pinned one — `zoom.ts` and
     *  `dense-tile-grid.ts` set the same `window.__gantt` pattern for one Gantt each. */
    __ganttPinned: Gantt;
  }
}

document.documentElement.classList.remove('dark');

const dataset = new Dataset({ entries: sampleEntryInputs, timeZone: 'UTC' });

// Recipe 1: the app writes `gantt.theme` directly.
const pushedGantt = new Gantt({
  container: '#gantt-pushed',
  dataset,
  theme: 'light',
  gridWidth: 'fitColumns',
  a11yLabel: 'Gantt, theme pushed directly',
});

// Recipe 2: the app pins `data-fg-theme` on the wrapper; this Gantt reads it through `'auto'`.
const pinnedWrapper = document.querySelector<HTMLElement>('#pinned-wrapper')!;
const pinnedGantt = new Gantt({
  container: '#gantt-pinned',
  dataset,
  theme: 'auto',
  gridWidth: 'fitColumns',
  a11yLabel: 'Gantt, theme pinned on a wrapper',
});

// e2e fixture hook, the same shape `zoom.ts`/`dense-tile-grid.ts` already expose. Two Gantts on
// this page, so `__ganttPinned` names the second one — `pushedGantt`'s own `data-fg-theme` write is
// visible on `#gantt-pushed` directly, but `pinnedGantt`'s `'auto'` answer never writes an attribute
// of its own; a test reads its `resolvedTheme` here instead.
window.__gantt = pushedGantt;
window.__ganttPinned = pinnedGantt;

const flipsReadout = document.querySelector<HTMLOutputElement>('[data-testid="theme-flips"]')!;
let flips = 0;
const countFlip = (): void => {
  flips++;
  flipsReadout.textContent = `${flips} theme flip${flips === 1 ? '' : 's'}`;
};
pushedGantt.on('themeChange', countFlip);
pinnedGantt.on('themeChange', countFlip);

document.querySelector('[data-testid="toggle-dark-mode"]')!.addEventListener('click', () => {
  const isDark = document.documentElement.classList.toggle('dark');
  // One extra line in the app's own toggle — both push recipes, in the same handler.
  pushedGantt.theme = isDark ? 'dark' : 'light';
  pinnedWrapper.setAttribute('data-fg-theme', isDark ? 'dark' : 'light');
});
