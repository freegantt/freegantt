// Deterministic fixture for the "Scheduling" harness page. A chain of six tasks joined by all four
// Dependency types and one negative lag, then a loop of three tasks. Every link of the chain holds
// at load, so the first drag moves only what the drag reaches. Fixed UTC dates only, no clock read.

import type { DependencyInput, EntryInput } from 'freegantt';

const FIRST_DAY = '2026-03-02';
const MS_PER_DAY = 86_400_000;

function dayStart(offsetDays: number): string {
  return new Date(Date.parse(`${FIRST_DAY}T00:00:00Z`) + offsetDays * MS_PER_DAY).toISOString();
}

function task(id: string, name: string, firstDay: number, lastDay: number): EntryInput {
  return { id, name, start: dayStart(firstDay), end: dayStart(lastDay) };
}

export const schedulingEntryInputs: readonly EntryInput[] = [
  task('plan', 'Plan', 0, 3),
  task('design', 'Design', 3, 7),
  task('build', 'Build', 4, 9),
  task('test', 'Test', 6, 9),
  task('handover', 'Handover', 4, 6),
  task('launch', 'Launch', 5, 8),
  task('loop-a', 'Loop A', 10, 12),
  task('loop-b', 'Loop B', 12, 14),
  task('loop-c', 'Loop C', 14, 16),
];

const days = (value: number) => ({ value, unit: 'day' as const });

/** The chain holds at load. `link-launch` carries the negative lag. */
export const chainDependencies: readonly DependencyInput[] = [
  { id: 'link-fs', fromId: 'plan', toId: 'design', type: 'FS', lag: days(0) },
  { id: 'link-ss', fromId: 'design', toId: 'build', type: 'SS', lag: days(1) },
  { id: 'link-ff', fromId: 'build', toId: 'test', type: 'FF', lag: days(0) },
  { id: 'link-sf', fromId: 'test', toId: 'handover', type: 'SF', lag: days(0) },
  { id: 'link-launch', fromId: 'handover', toId: 'launch', type: 'FS', lag: days(-1) },
];

/** `link-back` closes the loop. Without it the three tasks form a chain. */
export const loopDependencies: readonly DependencyInput[] = [
  { id: 'link-a-b', fromId: 'loop-a', toId: 'loop-b', type: 'FS', lag: days(0) },
  { id: 'link-b-c', fromId: 'loop-b', toId: 'loop-c', type: 'FS', lag: days(0) },
  { id: 'link-back', fromId: 'loop-c', toId: 'loop-a', type: 'FS', lag: days(0) },
];
