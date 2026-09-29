// Deterministic hierarchy fixture for harness/e2e/hierarchy.html: three levels deep, one
// childless parent-with-no-children ("phase-empty" — ADR 0013: a row with no children is a normal
// Entry, not a demoted group), one single-day span, `cost` in `props` on every leaf, and `team` for
// the filter. Fixed calendar dates only — no clock read. Dates use `Z`-suffixed ISO strings so the
// fixture never calls `instant()` on a zoneless plain time (harness code is not allowed through
// `time/`'s plain-time helpers).
//
// Retired (ADR 0026, #421): a `segmented` entry with three deliberately overlapping `segments` (the
// #215/#217 covered-Segment repro) stood here. The `Segment` type no longer exists — an Entry now always
// draws exactly one Bar, and this page registers no plugin variant that draws several for one Entry.

import { currency } from 'freegantt';
import type { EntryInput } from 'freegantt';

/** What one crew-lead row's children carry, plus the boolean `req-1` itself reads (#421 C7). */
export type CrewDayProps = {
  showDaysOnRow: boolean;
  hours: number;
  worker: string;
  filled: boolean;
};

export type HierarchyEntryProps = { cost: number; team: string } & Partial<CrewDayProps>;

/** Leaf rows carry `props.cost` and `props.team`; every parent derives its look from having
 *  children (ADR 0013) — there is no stored classification any more. */
export const hierarchyEntryInputs: EntryInput<HierarchyEntryProps>[] = [
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
  // #421 C7: a crew-lead row — `req-1` draws its three children as segments, so they draw as day bars on its
  // own row instead of rows of their own (`childrenAsSegments`, ADR 0026). Each child names its own
  // worker and hours; the parent keeps no dates of its own — they roll up from its children (ADR
  // 0013). `req-1-wed` is `locked`, so the harness can show a capability withheld from one bar and
  // not its neighbours.
  { id: 'req-1', name: 'Framing crew', parentId: 'program', props: { showDaysOnRow: true } },
  {
    id: 'req-1-mon',
    name: 'Ali',
    parentId: 'req-1',
    start: '2026-03-16',
    end: '2026-03-17',
    props: { hours: 8, worker: 'Ali', filled: true },
  },
  {
    id: 'req-1-tue',
    name: 'Ben',
    parentId: 'req-1',
    start: '2026-03-17',
    end: '2026-03-18',
    props: { hours: 8, worker: 'Ben', filled: true },
  },
  {
    id: 'req-1-wed',
    name: 'Cy',
    parentId: 'req-1',
    start: '2026-03-18',
    end: '2026-03-19',
    locked: true,
    props: { hours: 4, worker: 'Cy', filled: false },
  },
  // A root span with no name — an Entry's `name` is optional, and a nameless bar still draws; it
  // prints no label (#421 acceptance, user story 6).
  { id: 'site-hold', start: '2026-03-22', end: '2026-03-24' },
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
    // #421 C7: the crew-lead row's own Fields. `showDaysOnRow` is the boolean `childrenAsSegments`
    // matches on; `hours` rolls up onto the segmented row's grid cell the same way `cost` does above.
    { key: 'showDaysOnRow' as const, type: 'boolean' as const },
    { key: 'hours' as const, type: 'number' as const, rollUp: 'sum', column: { header: 'Hours' } },
    { key: 'worker' as const },
    { key: 'filled' as const, type: 'boolean' as const },
  ],
} as const;
