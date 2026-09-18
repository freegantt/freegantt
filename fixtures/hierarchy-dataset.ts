// Deterministic hierarchy fixture for harness/hierarchy.html (S4.11, D-S4-34): three levels deep, one
// childless parent-with-no-children ("phase-empty" — ADR 0013: a row with no children is a normal
// Entry, not a demoted group), one single-day span, `cost` in `props` on every leaf, and `team` for
// the filter. Fixed calendar dates only — no clock read. Dates use `Z`-suffixed ISO strings so the
// fixture never calls `instant()` on a zoneless plain time (harness code is not allowed through
// `time/`'s plain-time helpers).
//
// Retired (ADR 0026, #421): a `segmented` entry with three deliberately overlapping `segments` (the
// #215/#217 covered-Segment repro) stood here. A Segment no longer exists — an Entry now always
// draws exactly one Bar, and this page registers no plugin variant that draws several for one Entry.

import { currency } from 'freegantt';
import type { EntryInput } from 'freegantt';

/** Leaf rows carry `props.cost` and `props.team`; every parent derives its look from having
 *  children (ADR 0013) — there is no stored classification any more. */
export const hierarchyEntryInputs: EntryInput<{ cost: number; team: string }>[] = [
  { id: 'program', name: 'Program' },
  { id: 'phase-a', name: 'Phase A', parentId: 'program' },
  { id: 'phase-empty', name: 'Empty phase', parentId: 'program' },
  {
    id: 'plain-parent',
    name: 'Plain parent',
    parentId: 'phase-a',
    start: '2026-03-01',
    end: '2026-03-05',
  },
  {
    id: 'task-alpha-1',
    name: 'Alpha task one',
    parentId: 'phase-a',
    start: '2026-03-01',
    end: '2026-03-08',
    props: { cost: 100, team: 'alpha' },
  },
  {
    id: 'task-alpha-2',
    name: 'Alpha task two',
    parentId: 'phase-a',
    start: '2026-03-06',
    end: '2026-03-12',
    props: { cost: 200, team: 'alpha' },
  },
  {
    id: 'task-beta',
    name: 'Beta task',
    parentId: 'phase-a',
    start: '2026-03-10',
    end: '2026-03-14',
    props: { cost: 150, team: 'beta' },
  },
  {
    id: 'deep-leaf',
    name: 'Deep leaf',
    parentId: 'task-alpha-1',
    start: '2026-03-02',
    end: '2026-03-04',
    props: { cost: 50, team: 'alpha' },
  },
  {
    id: 'gate',
    name: 'Gate review',
    parentId: 'phase-a',
    start: '2026-03-20',
    end: '2026-03-20',
  },
];

export const hierarchyFieldOptions = {
  // #142: `end` keeps its demo purpose — a column closed on purpose, not by omission (the harness
  // page's own copy: "End stays read-only on purpose: a column is editable only when you say so").
  // `CORE_FIELDS.end` now defaults to editable, so this page states the override itself.
  fields: [
    {
      key: 'cost' as const,
      type: currency({ code: 'USD' }),
      rollUp: 'sum',
      editable: true,
      column: { header: 'Cost' },
    },
    { key: 'team' as const },
  ],
} as const;
