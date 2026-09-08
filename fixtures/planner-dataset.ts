// The `Gantt demo sandbox rebuild` design's own plan, as a Dataset. A construction schedule is what
// the design draws, so this fixture keeps its rows, its owners and its progress numbers — the page
// that reads it (`harness/planner.ts`) is a product-shaped demo, not a feature checklist.
//
// The whole plan slides on the calendar the way `demo-dataset.ts`'s does, so "today" always lands
// where the design puts it: 71 days into a 133-day build, mid-Structural-Framing. A fixture frozen
// on fixed dates would show the Today line off the left edge within a month of being written.
//
// Vocabulary note: `Entry` is the record, `kind: 'group'` is a phase, `kind: 'milestone'` is a
// checkpoint. "Task", "predecessor" and "the schedule" stay out of core's vocabulary (plans/01 §7) —
// this fixture is a construction plan because a consumer said so, not because the library knows one.

import { addMs, diffMs, instant, MS } from '../src/api/index.js';
import type { Aggregator, EntryInput, Field, FieldType, InstantInput } from '../src/api/index.js';

/** What the design stores per row, beyond the Entry keys core already owns. */
export interface PlannerMeta {
  /** Initials in the Own column. Absent on a phase and on a checkpoint. */
  owner?: string;
  /** Percent complete, 0–100. A phase rolls its children's up, duration-weighted. */
  progress?: number;
  /** The phase hue this row's bar paints in. Stored per row so a bar renderer never has to walk to
   *  a parent to find out what colour it is. */
  phase?: number;
  /** On the critical path — the design's inset ring. */
  critical?: boolean;
  /** Needs a permit — the design's `P` badge in the Task cell. */
  permit?: boolean;
}

const DAY = MS.DAY;
const TOTAL_DAYS = 133;
/** Where the design puts "now" in its own 133-day window. */
const TODAY_AT_DAY = 71;

/** Day 0 of the plan, floored to UTC midnight so every entry starts on a whole day and a day-snapped
 *  drag lands on a visible gridline (`demo-dataset.ts` floors the same way, for the same reason). */
const now = new Date();
const todayMidnightMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
const originMs = todayMidnightMs - TODAY_AT_DAY * DAY;

function dayOffset(day: number): InstantInput {
  return addMs(instant(originMs), day * DAY);
}

/** The window the plan occupies, for a Gantt that wants to frame the whole thing. */
export const plannerSpan = { start: dayOffset(0), end: dayOffset(TOTAL_DAYS) };

/** One phase's rows. `hue` is the OKLCH hue the page's own CSS names a colour for, per theme. */
interface Phase {
  readonly id: string;
  readonly name: string;
  readonly hue: number;
  readonly rows: readonly PlannerRow[];
}

/** `[id, name, owner, startDay, durationDays, progress, flags]`. `flags` reads as the design's own:
 *  `m` a checkpoint, `c` on the critical path, `p` needs a permit. */
type PlannerRow = readonly [string, string, string, number, number, number, string];

const PHASES: readonly Phase[] = [
  {
    id: 'pre-construction',
    name: 'Pre-Construction',
    hue: 60,
    rows: [
      ['permits', 'Permits & approvals', 'JR', 0, 12, 100, 'p'],
      ['geotech', 'Geotechnical survey', 'AM', 5, 6, 100, ''],
      ['design-review', 'Final design review', 'SK', 8, 10, 100, 'c'],
      ['notice-to-proceed', 'Notice to proceed', '', 18, 0, 100, 'mcp'],
    ],
  },
  {
    id: 'site-preparation',
    name: 'Site Preparation',
    hue: 30,
    rows: [
      ['mobilization', 'Site mobilization', 'DH', 18, 4, 100, 'c'],
      ['demolition', 'Demolition & clearing', 'DH', 22, 7, 100, 'c'],
      ['excavation', 'Excavation', 'DH', 29, 9, 100, 'c'],
      ['utility-relocations', 'Utility relocations', 'MP', 24, 14, 100, ''],
      ['site-grading', 'Site grading', 'DH', 38, 5, 100, 'c'],
    ],
  },
  {
    id: 'foundation',
    name: 'Foundation',
    hue: 285,
    rows: [
      ['footing-formwork', 'Footing formwork', 'LC', 43, 6, 100, 'c'],
      ['rebar', 'Rebar installation', 'LC', 47, 5, 100, 'c'],
      ['footing-pour', 'Footing concrete pour', 'LC', 52, 3, 100, 'c'],
      ['foundation-walls', 'Foundation walls', 'LC', 55, 10, 100, 'c'],
      ['waterproofing', 'Waterproofing & drainage', 'TG', 63, 6, 95, ''],
      ['slab-on-grade', 'Slab on grade', 'LC', 65, 5, 100, 'c'],
      ['foundation-complete', 'Foundation complete', '', 70, 0, 100, 'mc'],
    ],
  },
  {
    id: 'structural-framing',
    name: 'Structural Framing',
    hue: 15,
    rows: [
      ['steel-columns', 'Steel column erection', 'BV', 70, 8, 100, 'c'],
      ['floor-decking', 'Floor decking', 'BV', 76, 9, 80, 'c'],
      ['wall-framing', 'Wall framing — L1/L2', 'RN', 80, 12, 70, ''],
      ['roof-framing', 'Roof framing', 'RN', 85, 9, 35, 'c'],
      ['stair-assemblies', 'Stair assemblies', 'BV', 88, 7, 20, ''],
    ],
  },
  {
    id: 'mep-rough-in',
    name: 'MEP Rough-In',
    hue: 215,
    rows: [
      ['electrical', 'Electrical rough-in', 'EV', 94, 14, 10, 'cp'],
      ['plumbing', 'Plumbing rough-in', 'PL', 96, 13, 5, ''],
      ['hvac', 'HVAC ductwork', 'HV', 98, 12, 0, ''],
      ['fire-suppression', 'Fire suppression', 'FS', 102, 10, 0, ''],
      ['mep-inspection', 'MEP rough inspection', '', 108, 0, 0, 'mcp'],
    ],
  },
];

function entryForRow(row: PlannerRow, phase: Phase): EntryInput<PlannerMeta> {
  const [id, name, owner, startDay, durationDays, progress, flags] = row;
  const isCheckpoint = flags.includes('m');
  const meta: PlannerMeta = { progress, phase: phase.hue };
  if (owner !== '') meta.owner = owner;
  if (flags.includes('c')) meta.critical = true;
  if (flags.includes('p')) meta.permit = true;

  const entry: EntryInput<PlannerMeta> = {
    id,
    name,
    parentId: phase.id,
    start: dayOffset(startDay),
    // A checkpoint is one instant. Core stores a half-open span, so its end is the next day and the
    // milestone renderer floors the painted width around the instant itself.
    end: dayOffset(startDay + (isCheckpoint ? 1 : durationDays)),
    meta,
  };
  if (isCheckpoint) entry.kind = 'milestone';
  return entry;
}

/** The plan: five phases, each a `kind: 'group'` parent, with its own rows under it. A phase states
 *  no dates of its own — `start`/`end` roll up from its children, which is what core already does. */
export const plannerEntryInputs: readonly EntryInput<PlannerMeta>[] = PHASES.flatMap((phase) => [
  { id: phase.id, name: phase.name, kind: 'group' as const, meta: { phase: phase.hue } },
  ...phase.rows.map((row) => entryForRow(row, phase)),
]);

/** Percent complete for a phase: its children's own progress, weighted by how long each one runs, so
 *  a two-week row at 50% counts for more than a one-day row at 100%. A plain `sum` would read past
 *  100 and a plain average would call every row the same size.
 *
 *  Registered by name, never passed inline — a name serializes into a Document and a function does
 *  not (`plans/01`, Vocabulary). A checkpoint has no duration to weigh, so it does not vote. */
const weightedProgress: Aggregator<number> = (children, _parent, ctx) => {
  let weight = 0;
  let weighted = 0;
  for (const child of children) {
    if (child.kind === 'milestone') continue;
    const progress = ctx.read(child, 'progress');
    if (typeof progress !== 'number') continue;
    const days = Math.max(1, Math.round(diffMs(child.end, child.start) / DAY));
    weight += days;
    weighted += days * progress;
  }
  return weight === 0 ? undefined : Math.round(weighted / weight);
};

const percent: FieldType<number> = {
  rollUp: 'weightedProgress',
  formatValue: (value) => (typeof value === 'number' ? `${value}%` : ''),
  parseValue: (text) => {
    const parsed = Number(text.replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? Math.max(0, Math.min(100, Math.round(parsed))) : undefined;
  },
  editable: true,
  inputType: 'number',
  column: { align: 'end', header: 'Done' },
};

const PLANNER_FIELDS: readonly Field[] = [
  { key: 'owner', column: { header: 'Own', align: 'center' } },
  { key: 'progress', type: 'percent' },
  { key: 'phase' },
  { key: 'critical' },
  { key: 'permit' },
  // The design's `#` column: a checkpoint shows a diamond, every other row shows its own id. It has
  // no stored home and never rolls up, which is exactly what a `compute` source is for (ADR 0005) —
  // and it is the one column on this page that refuses the editor for a reason a reader can see.
  {
    key: 'ref',
    source: {
      from: 'compute',
      read: (entry) => (entry.kind === 'milestone' ? '◆' : entry.kind === 'group' ? '' : entry.id),
    },
    column: { header: '#', width: 116 },
  },
];

/** Everything a `Dataset` needs to read this plan. Spread it into the constructor beside `entries`. */
export const plannerFieldOptions = {
  aggregators: { weightedProgress: weightedProgress as Aggregator },
  fieldTypes: { percent: percent as FieldType },
  fields: PLANNER_FIELDS,
} as const;
