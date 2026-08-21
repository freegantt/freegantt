import { Gantt, Project } from '../src/api/index.js';
import { sampleTasks } from '../fixtures/sample-project.js';

const host = document.getElementById('chart');
if (!host) throw new Error('harness: #chart host missing from index.html');

const project = new Project({ tasks: sampleTasks });
new Gantt({ host, project, pxPerMs: 1 / (1000 * 60 * 30), rowHeight: 32 });
