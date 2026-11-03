// Deterministic fixture for the "Dependencies" harness page: three groups of four tasks, then a tail
// of free tasks long enough to scroll. Fixed UTC dates only, no clock read.
//
// Two dependency sets. The first holds all four types and one negative lag. The second shares no id
// with the first, so a "Replace dependencies" click visibly swaps every line.

import type { DependencyInput, EntryInput } from 'freegantt';

const GROUPS = [
  { id: 'foundation', name: 'Foundation', first: '2026-03-02' },
  { id: 'structure', name: 'Structure', first: '2026-03-23' },
  { id: 'fit-out', name: 'Fit-out', first: '2026-04-13' },
] as const;

const TASKS_PER_GROUP = 4;
const TAIL_TASKS = 36;
const MS_PER_DAY = 86_400_000;

function dayStart(base: string, offsetDays: number): string {
  return new Date(Date.parse(`${base}T00:00:00Z`) + offsetDays * MS_PER_DAY).toISOString();
}

/** A group with four 4-day tasks, one starting every 3 days. The tasks overlap by a day. */
const groupEntries = GROUPS.flatMap((group): EntryInput[] => [
  { id: group.id, name: group.name },
  ...Array.from({ length: TASKS_PER_GROUP }, (_, index): EntryInput => {
    const offset = index * 3;
    return {
      id: `${group.id}-${index + 1}`,
      name: `${group.name} ${index + 1}`,
      parentId: group.id,
      start: dayStart(group.first, offset),
      end: dayStart(group.first, offset + 4),
    };
  }),
]);

const tailEntries = Array.from({ length: TAIL_TASKS }, (_, index): EntryInput => {
  const offset = (index % 12) * 4;
  return {
    id: `tail-${index + 1}`,
    name: `Task ${index + 1}`,
    start: dayStart('2026-03-02', offset),
    end: dayStart('2026-03-02', offset + 3),
  };
});

export const dependencyEntryInputs: readonly EntryInput[] = [...groupEntries, ...tailEntries];

const days = (value: number) => ({ value, unit: 'day' as const });

/** All four types, a backward (negative lag) and a touching finish-to-start, and `dep-ss` with a negative lag. */
export const firstDependencies: readonly DependencyInput[] = [
  { id: 'dep-fs', fromId: 'foundation-1', toId: 'foundation-2', type: 'FS', lag: days(0) },
  { id: 'dep-ss', fromId: 'foundation-2', toId: 'foundation-3', type: 'SS', lag: days(-1) },
  { id: 'dep-ff', fromId: 'foundation-3', toId: 'foundation-4', type: 'FF', lag: days(2) },
  { id: 'dep-sf', fromId: 'foundation-4', toId: 'structure-1', type: 'SF', lag: days(1) },
  // A backward finish-to-start: a negative lag puts the target before the source's end, several rows below.
  { id: 'dep-back', fromId: 'foundation-4', toId: 'tail-3', type: 'FS', lag: days(-3) },
  // A finish-to-start whose target starts a day after the source ends, on the next row.
  { id: 'dep-touch', fromId: 'tail-1', toId: 'tail-2', type: 'FS', lag: days(0) },
  { id: 'dep-far', fromId: 'foundation-1', toId: 'tail-30', type: 'FS', lag: days(0) },
];

/** A different set: it shares no id with the first. */
export const secondDependencies: readonly DependencyInput[] = [
  { id: 'next-fs', fromId: 'structure-1', toId: 'structure-2', type: 'FS', lag: days(0) },
  { id: 'next-ff', fromId: 'structure-2', toId: 'structure-3', type: 'FF', lag: days(0) },
  { id: 'next-fit', fromId: 'structure-4', toId: 'fit-out-1', type: 'FS', lag: days(3) },
];
