// The `Gantt demo sandbox rebuild` design's own plan, as a Dataset. A construction schedule is what
// the design draws, so this fixture keeps its rows, its owners and its progress numbers — the page
// that reads it (`harness/planner.ts`) is a product-shaped demo, not a feature checklist.
//
// The whole plan slides on the calendar the way `demo-dataset.ts`'s does, so "today" always lands
// where the design puts it: 71 days into a 133-day build, mid-Structural-Framing. A fixture frozen
// on fixed dates would show the Today line off the left edge within a month of being written.
//
// Vocabulary note: `Entry` is the record. A phase is a row with children — ADR 0013 leaves it no
// stored classification, so `harness/planner.ts` asks `childrenOf` the way any other consumer would.
// A checkpoint is a row this fixture marks with its own `checkpoint` Field, and `harness/planner.ts`
// installs one variant whose rule reads it back (ADR 0018). Nothing stores a variant.
// "Task", "predecessor" and "the schedule" stay out of core's vocabulary (plans/01 §7) — this fixture
// is a construction plan because a consumer said so, not because the library knows one.

import { addMs, dateFormatter, instant, lastCoveredInstant, MS } from 'freegantt';
import type { ComputeContext, FormatContext, StoredEntry, EntryInput, Field, Instant } from 'freegantt';

/** What the design stores per row, beyond the Entry keys core already owns. */
export interface PlannerEntryProps {
  /** Initials in the Own column. Absent on a phase and on a checkpoint. */
  owner?: string;
  /** Percent complete, 0–100. A phase rolls its children's up, duration-weighted. */
  progress?: number;
  /** The phase hue this row's bar paints in. Stored per row so a bar renderer never has to walk to
   *  a parent to find out what colour it is. */
  phase?: number;
  /** On the critical path — the design's inset ring. */
  critical?: boolean;
  /** A checkpoint row. This is how a page pins one variant (ADR 0018): the page owns the word, the
   *  Gantt's own `variants` rule reads it back, and nothing in core learns what a checkpoint is. */
  checkpoint?: boolean;
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

function dayOffset(day: number): Instant {
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
 *  `m` a checkpoint, `c` on the critical path. */
type PlannerRow = readonly [string, string, string, number, number, number, string];

const PHASES: readonly Phase[] = [
  {
    id: 'pre-construction',
    name: 'Pre-Construction',
    hue: 60,
    rows: [
      ['permits', 'Permits & approvals', 'JR', 0, 12, 100, ''],
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
      ['electrical', 'Electrical rough-in', 'EV', 94, 14, 10, 'c'],
      ['plumbing', 'Plumbing rough-in', 'PL', 96, 13, 5, ''],
      ['hvac', 'HVAC ductwork', 'HV', 98, 12, 0, ''],
      ['fire-suppression', 'Fire suppression', 'FS', 102, 10, 0, ''],
      ['mep-inspection', 'MEP rough inspection', '', 108, 0, 0, 'mcp'],
    ],
  },
];

function entryForRow(row: PlannerRow, phase: Phase): EntryInput<PlannerEntryProps> {
  const [id, name, owner, startDay, durationDays, progress, flags] = row;
  const isCheckpoint = flags.includes('m');
  const meta: PlannerEntryProps = { progress, phase: phase.hue };
  if (owner !== '') meta.owner = owner;
  if (flags.includes('c')) meta.critical = true;
  if (isCheckpoint) meta.checkpoint = true;

  return {
    id,
    name,
    parentId: phase.id,
    start: dayOffset(startDay),
    // A checkpoint is one instant: `end === start`, zero duration (ADR 0022). `diamond()`'s box
    // holds its own size, so the true zero-width span is honest data, not a rendering problem.
    end: dayOffset(startDay + (isCheckpoint ? 0 : durationDays)),
    props: meta,
  };
}

/** The plan: five phases, each a row with children, with its own rows under it. A phase states no
 *  dates of its own — `start`/`end` roll up from its children, which is what core already does. It
 *  needs no stored classification (ADR 0013): a row with children already draws the parent look. */
export const plannerEntryInputs: readonly EntryInput<PlannerEntryProps>[] = PHASES.flatMap((phase) => [
  { id: phase.id, name: phase.name, props: { phase: phase.hue } },
  ...phase.rows.map((row) => entryForRow(row, phase)),
]);

function isCheckpointEntry(entry: EntryInput<PlannerEntryProps> | StoredEntry): boolean {
  return (entry.props as PlannerEntryProps | undefined)?.checkpoint === true;
}

/** What the `#` column counts: work rows, numbered from 1 in authored order. A phase and a
 *  checkpoint are both skipped, so the numbers run unbroken down the work itself — the design's own
 *  reading of the column. Authored order is the fixture's to state, which is why the map is built
 *  here beside the entries rather than derived from a rendered row. A phase has no `parentId`; a
 *  checkpoint does, so it is told apart by id, the same way `harness/planner.ts` tells its bar apart. */
const WORK_ROW_NUMBERS = new Map<string, number>(
  plannerEntryInputs
    .filter((entry) => entry.parentId !== undefined && !isCheckpointEntry(entry))
    .map((entry, index) => [String(entry.id), index + 1]),
);

// The design's compact Start/Finish format: two-digit day, three-letter month, no year, no time —
// `02 Mar`, not the core Field's own `Jun 29, 2026, 12:00 AM`. Built on the public `dateFormatter`
// and `lastCoveredInstant`, so the "last day covered" rule lives in the library, not here.
const compactStart = dateFormatter({ day: '2-digit', month: 'short' });

function compactFinish(
  value: unknown,
  ctx: FormatContext,
  entry: { readonly start?: Instant | undefined },
): string {
  if (value === undefined || value === null) return '';
  const covered = lastCoveredInstant({ start: entry.start, end: value as Instant });
  return compactStart(covered, ctx);
}

const PLANNER_FIELDS: readonly Field[] = [
  { key: 'start', formatValue: compactStart },
  { key: 'end', formatValue: compactFinish },
  { key: 'owner', column: { header: 'Own', align: 'center' } },
  // ADR 0018: the page's own word for a checkpoint row. The Gantt's `variants` rule reads it back,
  // `update(id, { checkpoint: true })` would pin another row, and core never learns the word.
  { key: 'checkpoint' },
  // Percent complete for a phase: its children's own progress, weighted by how long each one runs,
  // so a two-week row at 50% counts for more than a one-day row at 100% — `percent` is the shipped
  // Field type (`data/fields/field-types.ts`), and `weightedMeanByDuration` is the shipped
  // Aggregator it names; a plain `sum` would read past 100 and a plain average would call every row
  // the same size. `editable` stays a fact about this dataset, not the unit — the harness lets a
  // reader double-click the Done cell in place (`harness/planner.ts`).
  { key: 'progress', type: 'percent', rollUp: 'weightedMeanByDuration', editable: true },
  { key: 'phase' },
  { key: 'critical' },
  // The design's `#` column: a work row shows its own number, a phase shows nothing, and a
  // checkpoint shows a diamond instead of a number. `hasChildren` decides "phase" live, on every
  // pass — a row that gains its first child blanks the cell, and a row that loses its last one
  // shows its number again. Its number never changes: `WORK_ROW_NUMBERS` is the design's fixed row
  // id, authored order, not a live count. It has no stored home and never rolls up, which is
  // exactly what a `compute` Field is for (ADR 0011) — and it is the one column on this page that
  // refuses the editor for a reason a reader can see.
  {
    key: 'ref',
    compute: (entry: StoredEntry, ctx: ComputeContext) =>
      isCheckpointEntry(entry)
        ? '◆'
        : ctx.hasChildren(entry)
          ? ''
          : (WORK_ROW_NUMBERS.get(entry.id)?.toString() ?? ''),
    // 32px is the design's own width, but its cells carry no padding and ours do — at 32 a
    // two-digit number ellipsises to `1.`. The number is the column's whole point, so the width
    // gives way, not the number.
    column: { header: '#', width: 44, align: 'center' },
  },
];

/** Everything a `Dataset` needs to read this plan. Spread it into the constructor beside `entries`.
 *  `percent` and `weightedMeanByDuration` are both shipped — nothing local to register. */
export const plannerFieldOptions = {
  fields: PLANNER_FIELDS,
} as const;
