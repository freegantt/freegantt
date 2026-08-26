// e2e fixture for S1.9's acceptance checks (plans/s1.9-presets-and-zoom/README.md §6, §9): a
// wheel-zoom-equivalent `zoomBy` call against the live harness, and a preset switch, exercised the
// way U1/U2/U3 describe. No wheel/pointer gesture controller exists yet (S4), so the Gantt instance
// is exposed on `window.__gantt` and the test drives the imperative surface directly — same idea as
// `scroll-sync.ts` exposing shared models for e2e cases happy-dom cannot express.

import { Gantt, Dataset } from '../src/api/index.js';
import { sampleEntryInputs } from '../fixtures/sample-dataset.js';

const dataset = new Dataset({ entries: sampleEntryInputs, timeZone: 'UTC' });

const gantt = new Gantt({ container: '#gantt', dataset });

declare global {
  interface Window {
    __gantt: Gantt;
  }
}
window.__gantt = gantt;
