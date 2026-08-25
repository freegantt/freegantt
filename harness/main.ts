import { Gantt, Dataset } from '../src/api/index.js';
import { sampleEntryInputs } from '../fixtures/sample-project.js';

const dataset = new Dataset({ entries: sampleEntryInputs, timeZone: 'UTC' });

new Gantt({ host: '#gantt', dataset });
