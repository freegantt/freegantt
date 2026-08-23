import { Gantt, Project, TimeScaleModel } from '../src/api/index.js';
import { sampleTasks } from '../fixtures/sample-project.js';

const host = document.getElementById('chart');
if (!host) throw new Error('harness: #chart host missing from index.html');

const project = new Project({ tasks: sampleTasks });

// TODO(S1.4, #1): delete this block — `new Gantt({ host, project, rowHeight: 32 })` already renders
// identically, because Chart.defaultScale() re-derives exactly this span, zone and pxPerMs privately.
// It survives only as the visible motivation for `range: 'fitProject'`: today the API offers a
// fully-built TimeScaleModel or an undocumented private default and nothing between, so a consumer
// wanting an explicit viewport must re-walk the project's own tasks. The zone belongs to Project (D6)
// and pxPerMs to fitProject (project span / viewport width) — both land in S1.4, and this goes with
// them. Note the magic constant below: freegantt/* lint is scoped to src/**, so harness/ never
// reports what the library forbids itself.
const start = sampleTasks.reduce((min, t) => (t.start < min ? t.start : min), sampleTasks[0]!.start);
const end = sampleTasks.reduce((max, t) => (t.end > max ? t.end : max), sampleTasks[0]!.end);
const scale = new TimeScaleModel({ zone: 'UTC', range: { start, end }, pxPerMs: 1 / (1000 * 60 * 30) });

new Gantt({ host, project, scale, rowHeight: 32 });
