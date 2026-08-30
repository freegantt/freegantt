import './harness-nav.ts';
import { Gantt, Dataset } from '../src/api/index.js';
import type { Theme } from '../src/api/index.js';
import { demoEntryInputs } from '../fixtures/demo-dataset.js';
import { mountTimelineToolbar } from './timeline-toolbar.js';

const dataset = new Dataset({ entries: demoEntryInputs, timeZone: 'UTC' });

const gantt = new Gantt({ container: '#gantt', dataset });
// Zero-interaction visibility for the today line (S1.12, D-S1.12-14) — header readability follow-up
// pass 4. Needs no ResizeObserver measurement first: panToToday reads the already-resolved
// TimeScale, and the pane re-measures/re-renders on its own right after mount. `panToToday()`'s
// default `align: 'start'` leaves `todayLineMarginTicks`' worth of the timeline visible to the left
// of the line, the same landing a later "Today" button click reuses (S1.13 follow-up).
gantt.panToToday();

mountTimelineToolbar({ gantt, container: document.querySelector<HTMLDivElement>('#toolbar')! });

// S3.1: a click-to-select readout — the whole of S3's first visible step (D-S3-10). No drag/resize
// yet (S3.3/S3.4); this is selection only, over the plain `Gantt.selection` getter/setter and events.
const selectionReadout = document.querySelector<HTMLDivElement>('#selection-readout')!;
function renderSelection(): void {
  selectionReadout.textContent =
    gantt.selection.length === 0 ? 'Selection: (none)' : `Selection: ${gantt.selection.join(', ')}`;
}
gantt.on('selectionChange', renderSelection);
renderSelection();

const THEME_STORAGE_KEY = 'freegantt-harness-theme';

function isTheme(value: string | null | undefined): value is Theme {
  return value === 'auto' || value === 'light' || value === 'dark';
}

function applyTheme(choice: Theme): void {
  gantt.theme = choice;
  if (choice === 'auto') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', choice);
  }
  localStorage.setItem(THEME_STORAGE_KEY, choice);
  document.querySelectorAll<HTMLButtonElement>('[data-theme-choice]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset['themeChoice'] === choice));
  });
}

const stored = localStorage.getItem(THEME_STORAGE_KEY);
applyTheme(isTheme(stored) ? stored : 'auto');

document.querySelectorAll<HTMLButtonElement>('[data-theme-choice]').forEach((button) => {
  button.addEventListener('click', () => {
    const choice = button.dataset['themeChoice'];
    if (isTheme(choice)) applyTheme(choice);
  });
});
