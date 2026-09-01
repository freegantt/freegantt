// Deterministic hierarchy fixture for harness/hierarchy.html (S4.11, D-S4-34): three levels deep, one
// empty `'group'`, one `'milestone'`, one entry with three overlapping `segments`, deliberate overlaps
// for pack mode, `cost` in `meta` on every leaf, and `team` for the filter. Fixed calendar dates only —
// no clock read. Segment bounds use `Z`-suffixed ISO strings so the fixture never calls `instant()` on
// a zoneless plain time (harness code is not allowed through `time/`'s plain-time helpers).

import type { EntryInput } from '../src/api/index.js';

/** Leaf rows carry `meta.cost` and `meta.team`; parents are groups or a plain `'span'` reparent target. */
export const hierarchyEntryInputs: EntryInput<{ cost: number; team: string }>[] = [
  { id: 'program', name: 'Program', kind: 'group' },
  { id: 'phase-a', name: 'Phase A', kind: 'group', parentId: 'program' },
  { id: 'phase-empty', name: 'Empty phase', kind: 'group', parentId: 'program' },
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
    meta: { cost: 100, team: 'alpha' },
  },
  {
    id: 'task-alpha-2',
    name: 'Alpha task two',
    parentId: 'phase-a',
    start: '2026-03-06',
    end: '2026-03-12',
    meta: { cost: 200, team: 'alpha' },
  },
  {
    id: 'task-beta',
    name: 'Beta task',
    parentId: 'phase-a',
    start: '2026-03-10',
    end: '2026-03-14',
    meta: { cost: 150, team: 'beta' },
  },
  {
    id: 'deep-leaf',
    name: 'Deep leaf',
    parentId: 'task-alpha-1',
    start: '2026-03-02',
    end: '2026-03-04',
    meta: { cost: 50, team: 'alpha' },
  },
  {
    id: 'gate',
    name: 'Gate review',
    kind: 'milestone',
    parentId: 'phase-a',
    start: '2026-03-20',
    end: '2026-03-20',
  },
  {
    id: 'segmented',
    name: 'Segmented work',
    parentId: 'phase-a',
    start: '2026-04-01',
    end: '2026-04-15',
    segments: [
      { start: '2026-04-01T00:00:00.000Z', end: '2026-04-05T00:00:00.000Z' },
      { start: '2026-04-02T00:00:00.000Z', end: '2026-04-06T00:00:00.000Z' },
      { start: '2026-04-03T00:00:00.000Z', end: '2026-04-15T00:00:00.000Z' },
    ],
    meta: { cost: 300, team: 'alpha' },
  },
];

export const hierarchyFieldOptions = {
  fieldTypes: {
    money: {
      rollUp: 'sum' as const,
      formatValue: (value: unknown, ctx: { locale: Intl.LocalesArgument }) =>
        typeof value === 'number'
          ? new Intl.NumberFormat(ctx.locale, {
              style: 'currency',
              currency: 'USD',
              maximumFractionDigits: 0,
            }).format(value)
          : '',
      column: { align: 'end' as const, header: 'Cost' },
    },
  },
  fields: [{ key: 'cost' as const, type: 'money' }],
} as const;
