// e2e fixture for S1.5's acceptance checks (plans/s1.5-scroll-model/README.md §7, §9): two Gantts
// sharing one ScrollModel (and one TimeScaleModel, matching D9's "x, y, or both"), with the second
// chart holding far fewer rows than the first — the U3 clamp/pin case happy-dom cannot express.

import './harness-nav.ts';
import { Gantt, Dataset, ScrollModel, TimeScaleModel } from '../src/api/index.js';
import { demoEntryInputs } from '../fixtures/demo-dataset.js';

const tallDataset = new Dataset({ entries: demoEntryInputs, timeZone: 'UTC' });
const shortDataset = new Dataset({ entries: demoEntryInputs.slice(0, 20), timeZone: 'UTC' });

// `fit: 'preset'` (D-S1.11-4): the default `'pane'` makes content width equal pane width,
// so `max.x` is 0 and D9's x half is unobservable on the one page that exists to prove D9.
const scale = new TimeScaleModel({ fit: 'preset' });
const scroll = new ScrollModel();

new Gantt({ container: '#tall', dataset: tallDataset, scale, scroll });
new Gantt({ container: '#short', dataset: shortDataset, scale, scroll });
