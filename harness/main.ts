import { Gantt, Project, TimeScaleModel } from '../src/api/index.js';
import { sampleTasks } from '../fixtures/sample-project.js';

const host = document.getElementById('chart');
if (!host) throw new Error('harness: #chart host missing from index.html');

const project = new Project({ tasks: sampleTasks });
const start = sampleTasks.reduce((min, t) => (t.start < min ? t.start : min), sampleTasks[0]!.start);
const end = sampleTasks.reduce((max, t) => (t.end > max ? t.end : max), sampleTasks[0]!.end);
const scale = new TimeScaleModel({ zone: 'UTC', range: { start, end }, pxPerMs: 1 / (1000 * 60 * 30) });

new Gantt({ host, project, scale, rowHeight: 32 });
