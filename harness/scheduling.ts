// Scheduling, consumer meets it. `scheduling()` sits beside `entryDependencies()` on one Dataset.
// Drag a task and its successors follow. The loop at the bottom has no valid order, so the page
// lists its members from the plugin's diagnostics.
import { mountHarnessChrome } from './harness-nav.js';
import {
  Dataset,
  Gantt,
  entryDependencies,
  instant,
  scheduling,
  timeShading,
  workingCalendar,
} from 'freegantt';
import type { EntryConstraint, ScheduleDiagnostic } from 'freegantt';
import {
  chainDependencies,
  loopDependencies,
  schedulingEntryInputs,
} from '../fixtures/scheduling-dataset.js';
import { mountGanttToolbar } from './gantt-toolbar.js';
import { mountPageBrief } from './docs/page-brief.js';

mountHarnessChrome();
mountPageBrief(document.querySelector<HTMLDivElement>('#page-brief')!, 'scheduling');

// One working calendar states the days off once: weekends, and two holidays in the second week.
// `timeShading()` shades them and `scheduling()` counts workdays by them, so the two always agree.
const calendar = workingCalendar({ workdays: [1, 2, 3, 4, 5], holidays: ['2026-03-11', '2026-03-12'] });

// Two plugins on one Dataset. `scheduling()` names `entryDependencies()` in `requires`.
const dependencies = entryDependencies();
const plan = scheduling({ calendar });
const dataset = new Dataset({
  entries: schedulingEntryInputs,
  timeZone: 'UTC',
  plugins: [dependencies, plan],
});

const diagnosticsReadout = document.querySelector<HTMLSpanElement>('#diagnostics-readout')!;
const cycleList = document.querySelector<HTMLUListElement>('#cycle-members')!;
const constraintFindings = document.querySelector<HTMLUListElement>('#constraint-findings')!;
const constraintReadout = document.querySelector<HTMLSpanElement>('#constraint-readout')!;
const constraintForm = document.querySelector<HTMLFormElement>('#constraint-form')!;
const constraintEntry = document.querySelector<HTMLSelectElement>('#constraint-entry')!;
const constraintKind = document.querySelector<HTMLSelectElement>('#constraint-kind')!;
const constraintDate = document.querySelector<HTMLInputElement>('#constraint-date')!;

const CONSTRAINT_LABELS: Record<EntryConstraint['kind'], string> = {
  startNoEarlierThan: 'start no earlier than',
  finishNoLaterThan: 'finish no later than',
  mustStartOn: 'must start on',
};

const nameOf = (id: string): string => dataset.entries.get(id)?.name ?? id;

// What does a finding say about a constraint? A ceiling or a date the task breaks, or a Dependency that a date overrules.
function constraintSentence(finding: ScheduleDiagnostic): string | undefined {
  if (finding.code === 'constraint-violated')
    return `${nameOf(finding.entryId)} breaks "${CONSTRAINT_LABELS[finding.constraint]}"`;
  if (finding.code === 'blocked-move' && finding.reason === 'mustStartOn')
    return `${nameOf(finding.entryId)} keeps "must start on" and breaks a Dependency`;
  return undefined;
}

// What does the page say about the latest findings? Cycle members as a list, every other finding as text.
function showDiagnostics(): void {
  const findings = plan.diagnostics();
  const members = findings.flatMap((finding) => (finding.code === 'cycle' ? finding.entryIds : []));
  cycleList.replaceChildren(
    ...members.map((id) => {
      const item = document.createElement('li');
      item.textContent = dataset.entries.get(id)?.name ?? id;
      item.dataset['entryId'] = id;
      return item;
    }),
  );
  constraintFindings.replaceChildren(
    ...findings.flatMap((finding) => {
      const sentence = constraintSentence(finding);
      if (sentence === undefined) return [];
      const item = document.createElement('li');
      item.textContent = sentence;
      return [item];
    }),
  );
  const others = findings.filter((finding) => finding.code !== 'cycle');
  diagnosticsReadout.textContent = `Findings: ${others.length === 0 ? 'none' : others.map((f) => f.code).join(', ')}`;
}
plan.on('scheduleDiagnostics', showDiagnostics);

for (const entry of schedulingEntryInputs) {
  constraintEntry.append(new Option(entry.name ?? String(entry.id), String(entry.id)));
}

// What constraint does the chosen task hold? The readout answers it after each change.
function showConstraint(): void {
  const held = plan.constraintOf(constraintEntry.value);
  constraintReadout.textContent = held
    ? `Constraint: ${CONSTRAINT_LABELS[held.kind]} ${new Date(held.date).toISOString().slice(0, 10)}`
    : 'Constraint: none';
}
dataset.on('change', showConstraint);
constraintEntry.addEventListener('change', showConstraint);

constraintForm.addEventListener('submit', (event) => {
  event.preventDefault();
  plan.setConstraint(constraintEntry.value, {
    kind: constraintKind.value as EntryConstraint['kind'],
    date: instant(`${constraintDate.value}T00:00:00Z`),
  });
});
document.querySelector<HTMLButtonElement>('#clear-constraint-btn')!.addEventListener('click', () => {
  plan.clearConstraint(constraintEntry.value);
});

// An app loads Dependencies from a server call. `replaceAll` records no undo step.
dependencies.replaceAll([...chainDependencies, ...loopDependencies]);

const gantt = new Gantt({
  container: '#gantt',
  dataset,
  range: 'fitDataset',
  preset: 'dayAndWeek',
  gridWidth: 'fitColumns',
  gridColumns: ['name', 'start', 'end', { field: 'manuallyScheduled', header: 'Manual', toggle: true }],
  a11yLabel: 'Scheduling Gantt',
});
gantt.installPlugin(timeShading([{ covers: calendar.offTime(), class: 'off-time' }]));
mountGanttToolbar({ gantt, container: document.querySelector<HTMLDivElement>('#toolbar')! });

declare global {
  interface Window {
    __dataset: Dataset;
    __gantt: Gantt;
    __scheduling: typeof plan;
    __calendar: typeof calendar;
  }
}
window.__dataset = dataset;
window.__gantt = gantt;
window.__scheduling = plan;
window.__calendar = calendar;
showDiagnostics();
showConstraint();

// Remove the dependency that closes the loop, and the cycle clears.
document.querySelector<HTMLButtonElement>('#break-cycle-btn')!.addEventListener('click', () => {
  dependencies.remove('link-back');
});
document.querySelector<HTMLButtonElement>('#restore-cycle-btn')!.addEventListener('click', () => {
  dependencies.replaceAll([...chainDependencies, ...loopDependencies]);
});
