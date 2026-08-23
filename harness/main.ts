import { Gantt, Project } from '../src/api/index.js';
import { sampleTasks } from '../fixtures/sample-project.js';

const host = document.getElementById('chart');
if (!host) throw new Error('harness: #chart host missing from index.html');

const project = new Project({ tasks: sampleTasks, zone: 'UTC' });

new Gantt({ host, project, rowHeight: 32 });
