import { Gantt, Project } from '../src/api/index.js';
import { sampleEntries } from '../fixtures/sample-project.js';

const host = document.getElementById('gantt');
if (!host) throw new Error('harness: #gantt host missing from index.html');

const project = new Project({ entries: sampleEntries, zone: 'UTC' });

new Gantt({ host, project });
