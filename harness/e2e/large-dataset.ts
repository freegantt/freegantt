// e2e fixture for S1's [S1-A1] acceptance check (plans/s1.11-close-the-gate/README.md):
// 10,000 entries, `fit: 'preset'` so content is wider than the pane — the only configuration that
// exercises the horizontal window as well as the vertical one.

import { Gantt, Dataset, TimeScaleModel } from 'freegantt';
import { seededEntryInputs } from '../../fixtures/seeded-dataset.js';

const dataset = new Dataset({ entries: seededEntryInputs({ count: 10_000 }), timeZone: 'UTC' });
const scale = new TimeScaleModel({ fit: 'preset' });

new Gantt({ container: '#gantt', dataset, scale });
