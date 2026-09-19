// #433: the first consumer of `ThemeResolver`. Tailwind/Filament/next-themes signal dark mode with
// a class on `<html>`, not `data-fg-theme` or `prefers-color-scheme`. This page never writes the
// pin itself; the resolver below is the only thing that reads the class.
//
// `e2e/theme-resolver.spec.ts` drives this page: it toggles the class through the UI, the way a
// real wrapping app's own theme switch would, and checks the Gantt follows with no resolver storm
// (#433 loop fix, `#applyTheme`'s same-value guard).

import './harness-nav.ts';
import { Gantt, Dataset } from 'freegantt';
import { sampleEntryInputs } from '../fixtures/sample-dataset.js';
import { mountPageBrief } from './docs/page-brief.js';

mountPageBrief(document.querySelector<HTMLDivElement>('#page-brief')!, 'theme-resolver');

document.documentElement.classList.remove('dark');

const dataset = new Dataset({ entries: sampleEntryInputs, timeZone: 'UTC' });

const resolverCalls = document.querySelector<HTMLOutputElement>('[data-testid="resolver-calls"]')!;
let calls = 0;

const gantt = new Gantt({
  container: '#gantt',
  dataset,
  theme: () => {
    calls++;
    resolverCalls.textContent = `${calls} resolver calls`;
    return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
  },
});

// e2e fixture hook, the same shape `zoom.html`/`mount-destroy.html` already expose.
(window as unknown as { __gantt: Gantt }).__gantt = gantt;

document.querySelector('[data-testid="toggle-dark-class"]')!.addEventListener('click', () => {
  document.documentElement.classList.toggle('dark');
});
