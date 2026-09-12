// e2e fixture for S1.5's acceptance checks (plans/s1.5-scroll-model/README.md §7, §9): two Gantts
// sharing one ScrollModel (and one TimeScaleModel, matching D9's "x, y, or both"), with the second
// chart holding far fewer rows than the first — the U3 clamp/pin case happy-dom cannot express.

import './harness-nav.ts';
import { Gantt, Dataset, ScrollModel, TimeScaleModel } from 'freegantt';
import { demoEntryInputs } from '../fixtures/demo-dataset.js';
import { mountPageBrief } from './docs/page-brief.js';

// D-S5-29: what this page demonstrates, the config that does it, and the spec section that governs it.
mountPageBrief(document.querySelector<HTMLDivElement>('#page-brief')!, 'scroll-sync');

const tallDataset = new Dataset({ entries: demoEntryInputs, timeZone: 'UTC' });
const shortDataset = new Dataset({ entries: demoEntryInputs.slice(0, 20), timeZone: 'UTC' });

// `fit: 'preset'` (D-S1.11-4): the default `'pane'` makes content width equal pane width,
// so `max.x` is 0 and D9's x half is unobservable on the one page that exists to prove D9.
const scale = new TimeScaleModel({ fit: 'preset' });
const scroll = new ScrollModel();

// Distinct a11yLabel per instance: the default ('Gantt') is fine for one Gantt on a page, but two
// sharing it name the same accessible region twice (axe landmark-unique, D-S5-27).
new Gantt({ container: '#tall', dataset: tallDataset, scale, scroll, a11yLabel: 'Tall Gantt' });
new Gantt({ container: '#short', dataset: shortDataset, scale, scroll, a11yLabel: 'Short Gantt' });
