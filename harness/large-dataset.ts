// e2e fixture for S1's [S1-A1] acceptance check (plans/s1.11-close-the-gate/README.md D-S1.11-5):
// 5,000 entries, `fit: 'preset'` so content is wider than the pane — the only configuration that
// exercises the horizontal window as well as the vertical one.

import './harness-nav.ts';
import { Gantt, Dataset, TimeScaleModel } from 'freegantt';
import { seededEntryInputs } from '../fixtures/seeded-dataset.js';
import { mountPageBrief } from './docs/page-brief.js';

// D-S5-29: what this page demonstrates, the config that does it, and the spec section that governs it.
mountPageBrief(document.querySelector<HTMLDivElement>('#page-brief')!, 'large-dataset');

const dataset = new Dataset({ entries: seededEntryInputs({ count: 5000 }), timeZone: 'UTC' });
const scale = new TimeScaleModel({ fit: 'preset' });

new Gantt({ container: '#gantt', dataset, scale });
