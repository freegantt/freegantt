// Deterministic fixture for the "Critical path" harness page. Two branches join at Inspection:
// Survey, Utilities, Permits is the long one, and Foundation is the short one with a day of float.
// Fixed UTC dates only, no clock read.

import type { DependencyInput, EntryInput } from 'freegantt';

const FIRST_DAY = '2026-03-02';
const MS_PER_DAY = 86_400_000;

function dayStart(offsetDays: number): string {
  return new Date(Date.parse(`${FIRST_DAY}T00:00:00Z`) + offsetDays * MS_PER_DAY).toISOString();
}

function task(id: string, name: string, firstDay: number, lastDay: number): EntryInput {
  return { id, name, start: dayStart(firstDay), end: dayStart(lastDay) };
}

export const criticalPathEntryInputs: readonly EntryInput[] = [
  task('survey', 'Survey', 0, 3),
  task('foundation', 'Foundation', 3, 7),
  task('utilities', 'Utilities', 3, 5),
  task('permits', 'Permits', 5, 8),
  task('inspection', 'Inspection', 8, 10),
];

const finishToStart = (id: string, fromId: string, toId: string): DependencyInput => ({
  id,
  fromId,
  toId,
  type: 'FS',
  lag: { value: 0, unit: 'day' },
});

export const criticalPathDependencies: readonly DependencyInput[] = [
  finishToStart('survey-foundation', 'survey', 'foundation'),
  finishToStart('survey-utilities', 'survey', 'utilities'),
  finishToStart('utilities-permits', 'utilities', 'permits'),
  finishToStart('foundation-inspection', 'foundation', 'inspection'),
  finishToStart('permits-inspection', 'permits', 'inspection'),
];
