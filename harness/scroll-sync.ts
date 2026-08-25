// e2e fixture for S1.5's acceptance checks (plans/s1.5-scroll-model/README.md §7, §9): two Gantts
// sharing one ScrollModel (and one TimeScaleModel, matching D9's "x, y, or both"), with the second
// chart holding far fewer rows than the first — the U3 clamp/pin case happy-dom cannot express.

import { Gantt, Dataset, ScrollModel, TimeScaleModel } from '../src/api/index.js';
import { sampleEntryInputs } from '../fixtures/sample-project.js';

const tallDataset = new Dataset({ entries: sampleEntryInputs, timeZone: 'UTC' });
const shortDataset = new Dataset({ entries: sampleEntryInputs.slice(0, 20), timeZone: 'UTC' });

const scale = new TimeScaleModel();
const scroll = new ScrollModel();

new Gantt({ host: '#tall', dataset: tallDataset, scale, scroll });
new Gantt({ host: '#short', dataset: shortDataset, scale, scroll });
