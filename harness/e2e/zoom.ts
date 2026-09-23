// e2e fixture for S1.9's acceptance checks (plans/s1.9-presets-and-zoom/README.md §6, §9) and now the
// S1.12 timeline & navigation demo (plans/s1.12-timeline-navigation/README.md §3.7, D-S1.12-16): the
// live Gantt still lands on `window.__gantt` so `e2e/zoom.spec.ts` can drive `zoomBy`/`preset`
// directly (no wheel/gesture controller exists until S4), and the page now also carries a real
// toolbar over the plain `zoomIn`/`zoomOut`/`panToToday`/`fit`/`locale`/`todayLine` surface.

import { Gantt, Dataset } from 'freegantt';
import { demoEntryInputs } from '../../fixtures/demo-dataset.js';
import { multiYearEntryInputs } from '../../fixtures/multi-year-dataset.js';
import { mountTimelineToolbar } from '../timeline-toolbar.js';

let dataset = new Dataset({ entries: demoEntryInputs, timeZone: 'UTC' });
let gantt = new Gantt({ container: '#gantt', dataset });
// Zero-interaction visibility for the today line (S1.12, D-S1.12-14) — header readability
// follow-up pass 4; `align: 'start'` (the default) leaves `todayLineMarginTicks`' worth of margin
// (S1.13 follow-up), the same landing a "Today" button click reuses.
gantt.panToToday();

declare global {
  interface Window {
    __gantt: Gantt;
  }
}
window.__gantt = gantt;

const toolbar = document.querySelector<HTMLDivElement>('#toolbar')!;
mountTimelineToolbar({
  gantt,
  container: toolbar,
  showFit: true,
  showLocale: true,
  showTodayLineToggle: true,
  // #101 items 1-2: sub-hour rungs and the day-letter band, shipped as presets but outside the
  // default `zoomPresets` ladder (a custom preset is picked directly, never by stepping into it).
  extraPresetIds: ['minute', 'fifteenMinute', 'sixHour', 'dayLetterAndWeek'],
});

// D-S1.12-16: swapping datasets shows the density floor's effect — `sample` fits comfortably at any
// preset, `multi-year` scrolls at `day` instead of squishing (D-S1.12-2). A fresh Gantt is the plain
// rebind pattern `harness/e2e/data.ts`'s import button already uses.
document.querySelectorAll<HTMLInputElement>('input[name="dataset"]').forEach((radio) => {
  radio.addEventListener('change', () => {
    if (!radio.checked) return;
    dataset = new Dataset({
      entries: radio.value === 'multi-year' ? multiYearEntryInputs : demoEntryInputs,
      timeZone: 'UTC',
    });
    gantt.destroy();
    gantt = new Gantt({ container: '#gantt', dataset });
    window.__gantt = gantt;
    toolbar.innerHTML = '';
    mountTimelineToolbar({
      gantt,
      container: toolbar,
      showFit: true,
      showLocale: true,
      showTodayLineToggle: true,
      extraPresetIds: ['minute', 'fifteenMinute', 'sixHour', 'dayLetterAndWeek'],
    });
  });
});
