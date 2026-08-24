import { Gantt, Dataset } from '../src/api/index.js';
import { sampleEntries } from '../fixtures/sample-project.js';

const dataset = new Dataset({ entries: sampleEntries, timeZone: 'UTC' });

new Gantt({ host: '#gantt', dataset });
