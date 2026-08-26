// e2e fixture for S1's [S1-A1] acceptance check (plans/s1.11-close-the-gate/README.md D-S1.11-5):
// 5,000 entries, `zoom: 'preset'` so content is wider than the pane — the only configuration that
// exercises the horizontal window as well as the vertical one.

import { Gantt, Dataset, TimeScaleModel } from '../src/api/index.js';
import { seededEntryInputs } from '../fixtures/seeded-dataset.js';

const dataset = new Dataset({ entries: seededEntryInputs({ count: 5000 }), timeZone: 'UTC' });
const scale = new TimeScaleModel({ zoom: 'preset' });

new Gantt({ container: '#gantt', dataset, scale });
