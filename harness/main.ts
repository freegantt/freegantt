import { Gantt, Project } from '../src/api/index.js';
import { sampleEntries } from '../fixtures/sample-project.js';

const project = new Project({ entries: sampleEntries, timeZone: 'UTC' });

new Gantt({ host: '#gantt', project });
