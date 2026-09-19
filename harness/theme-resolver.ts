// #433: the first consumer of `ThemeResolver`. Tailwind/Filament/next-themes signal dark mode with
// a class on `<html>`, not `data-fg-theme` or `prefers-color-scheme`. This page never writes the
// pin itself; the resolver below is the only thing that reads the class.
//
// The resolver stays exactly the one-liner `docs/05-consumer-api.md` publishes — no counting, no
// `textContent` write, nothing beyond the answer (`ThemeResolver`'s own docblock: keep it cheap and
// free of side effects, because the widened observer calls it on unrelated DOM churn too). The
// readout below counts real `themeChange` events instead, which the library already emits; that is
// instrumentation this page owns, not something smuggled into the answer a reader copies.
//
// `e2e/theme-resolver.spec.ts` drives this page: it toggles the class through the UI, the way a
// real wrapping app's own theme switch would, and checks the Gantt follows with no resolver storm.
// `e2e/theme-resolver-loop.spec.ts` pins the storm fix itself, against `/zoom.html`'s own resolver
// wired up purely for that test.

import './harness-nav.ts';
import { Gantt, Dataset } from 'freegantt';
import { sampleEntryInputs } from '../fixtures/sample-dataset.js';
import { mountPageBrief } from './docs/page-brief.js';

mountPageBrief(document.querySelector<HTMLDivElement>('#page-brief')!, 'theme-resolver');

document.documentElement.classList.remove('dark');

const dataset = new Dataset({ entries: sampleEntryInputs, timeZone: 'UTC' });

const gantt = new Gantt({
  container: '#gantt',
  dataset,
  theme: () => (document.documentElement.classList.contains('dark') ? 'dark' : 'light'),
});

// e2e fixture hook, the same shape `zoom.html`/`mount-destroy.html` already expose.
(window as unknown as { __gantt: Gantt }).__gantt = gantt;

const flipsReadout = document.querySelector<HTMLOutputElement>('[data-testid="theme-flips"]')!;
let flips = 0;
gantt.on('themeChange', () => {
  flips++;
  flipsReadout.textContent = `${flips} theme flip${flips === 1 ? '' : 's'}`;
});

document.querySelector('[data-testid="toggle-dark-class"]')!.addEventListener('click', () => {
  document.documentElement.classList.toggle('dark');
});
