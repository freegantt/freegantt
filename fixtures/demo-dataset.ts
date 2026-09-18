// `sampleEntryInputs` (`sample-dataset.ts`) is frozen at 2026-09-01 on purpose — dozens of unit
// tests assert exact `2026-09-*` instants, so that fixture must never move (see this repo's
// `plans/s1.12-timeline-navigation/header-readability-followup.md`, finding 1). But a harness demo
// page wants the opposite: real dates around the real "today", so `todayLine`/`panToToday` actually
// show something when a person opens the page. This fixture reshapes `sampleEntryInputs` for that —
// every entry's own gaps and durations stay identical, the whole dataset is just slid on the
// calendar so it starts `WEEKS_BACK` weeks before whatever "now" is when the module loads.

import { sampleEntryInputs } from './sample-dataset.js';
import { addMs, currency, instant, MS } from 'freegantt';
import type { EntryInput, InstantInput } from 'freegantt';

const ORIGINAL_START_MS = Date.UTC(2026, 8, 1); // sampleEntryInputs's entry-1 start
const WEEKS_BACK = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

// Floored to today's own UTC midnight, not `Date.now()` directly (which carries the current
// time-of-day) — every `sampleEntryInputs` instant is already a bare midnight, and shifting by a
// non-day-aligned amount would carry that same fractional-day offset onto every demo entry, so a
// day-snapped drag would never land on the visible day gridline (it snaps to whole days from each
// entry's own start, wherever that already sits).
const now = new Date();
const todayStartMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
const desiredStartMs = todayStartMs - WEEKS_BACK * 7 * DAY_MS;
const shiftMs = ORIGINAL_START_MS - desiredStartMs;

function shift(input: NonNullable<EntryInput['start']>): Date {
  const ms = input instanceof Date ? input.getTime() : new Date(`${input}T00:00:00Z`).getTime();
  return new Date(ms - shiftMs);
}

/** `sampleEntryInputs`, slid onto the calendar so it spans from `WEEKS_BACK` weeks before "now" to a
 *  few months after — the shape a today-line/today-button demo needs. Not for unit tests: the exact
 *  instants move every time this module loads. Every `sampleEntryInputs` entry sets both `start` and
 *  `end`, so the non-null assertions below just carry that existing fixture's own shape forward. */
export const demoEntryInputs: EntryInput[] = sampleEntryInputs.map((entry) => ({
  ...entry,
  start: shift(entry.start!),
  end: shift(entry.end!),
}));

export type DemoEntryProps = { cost?: number; team?: string; milestone?: boolean };

/** The generic demo's claimed row (#421). Before ADR 0026 this Entry carried three Segments; a
 *  Segment no longer exists, so the same picture now comes from three child Entries and one
 *  `childrenAsSegments` rule. `main.ts` names this id, and its bench button turns the claim off to
 *  show the other half — the same three Entries as three ordinary rows. */
export const CLAIMED_PARENT_ID = 'entry-16';

/** Nested work tree for the generic demo: Program → workstream → work → a few grandchildren. */
const DEMO_CHILDREN: Readonly<Record<string, readonly string[]>> = {
  program: ['entry-1', 'entry-5', 'entry-10', 'entry-14', 'entry-26', 'entry-33'],
  'entry-1': ['entry-2', 'entry-4'],
  'entry-2': ['entry-3'],
  'entry-5': ['entry-6', 'entry-7', 'entry-9'],
  'entry-7': ['entry-8'],
  'entry-10': ['entry-11', 'entry-12', 'entry-13'],
  'entry-14': [
    'entry-15',
    'entry-16',
    'entry-17',
    'entry-18',
    'entry-19',
    'entry-20',
    'entry-21',
    'entry-22',
    'entry-23',
    'entry-24',
    'entry-25',
  ],
  // #421: `entry-16` is the generic demo's claimed row. Its three children draw as bars on its own
  // row, so it names them here like any other parent — claiming is a row-source rule, not a shape
  // the tree stores (`main.ts` sets `childrenAsSegments`).
  'entry-16': [`${CLAIMED_PARENT_ID}-a`, `${CLAIMED_PARENT_ID}-b`, `${CLAIMED_PARENT_ID}-c`],
  'entry-26': ['entry-27', 'entry-28', 'entry-29', 'entry-30', 'entry-31', 'entry-32'],
  'entry-33': [
    'entry-34',
    'entry-35',
    'entry-36',
    'entry-37',
    'entry-38',
    'entry-39',
    'entry-40',
    'entry-41',
    'entry-42',
    'entry-43',
    'entry-44',
    'entry-45',
    'entry-46',
    'entry-47',
  ],
  'entry-47': ['entry-48', 'entry-49', 'entry-50'],
};

const WORKSTREAM_TEAM: Readonly<Record<string, string>> = {
  'entry-1': 'core',
  'entry-5': 'edge',
  'entry-10': 'core',
  'entry-14': 'edge',
  'entry-26': 'core',
  'entry-33': 'launch',
};

function parentByChild(): Readonly<Record<string, string>> {
  const parents: Record<string, string> = {};
  for (const [parentId, children] of Object.entries(DEMO_CHILDREN)) {
    for (const childId of children) parents[childId] = parentId;
  }
  return parents;
}

const DEMO_PARENT = parentByChild();

function workstreamOf(id: string): string | undefined {
  let current: string | undefined = id;
  while (current !== undefined) {
    if (WORKSTREAM_TEAM[current] !== undefined) return current;
    current = DEMO_PARENT[current];
  }
  return undefined;
}

/** Where each leg sits, as whole days from the parent's start. Legs never overlap, so the pointer
 *  can land on every one of them — a bar drawn under another cannot be picked (#215). */
const SPREAD_LEGS: readonly (readonly [from: number, to: number])[] = [
  [0, 2],
  [3, 5],
  [6, 9],
];

/** Three legs packed into six days, for a page whose first screenful must show all three. The
 *  timeline culls a bar outside the visible window, so a ten-day spread puts the second and third
 *  leg off-screen on a page that opens near today (#421: the generic demo drew one leg of three
 *  until these dates tightened). */
export const COMPACT_LEGS: readonly (readonly [from: number, to: number])[] = [
  [0, 1],
  [2, 3],
  [4, 5],
];

/** Three child Entries from `start`, for a parent whose row claims them — one row that draws three
 *  bars (ADR 0026: a bar is a child Entry, and `childrenAsSegments` is what puts a parent's children
 *  on the parent's own row).
 *
 *  The parent keeps no dates of its own: three dated children roll its span up (ADR 0013). */
export function claimedChildrenOf(
  parentId: string,
  start: InstantInput,
  legs: readonly (readonly [from: number, to: number])[] = SPREAD_LEGS,
): EntryInput[] {
  const startMs = instant(start);
  const day = (count: number) => addMs(startMs, count * MS.DAY);
  const names = ['Leg A', 'Leg B', 'Leg C'];
  return legs.map(([from, to], i) => ({
    id: `${parentId}-${'abc'[i]}`,
    name: names[i] ?? `Leg ${i + 1}`,
    parentId,
    start: day(from),
    end: day(to),
  }));
}

export const demoFieldOptions = {
  // #142: `end` keeps its demo intent — `harness/index.html`'s own copy names only "Name, Start or
  // Budget" as editable. `CORE_FIELDS.end` now defaults to editable, so this page states the
  // override itself, the same way `hierarchy-dataset.ts` does.
  fields: [
    {
      key: 'cost' as const,
      type: currency({ code: 'USD' }),
      rollUp: 'sum',
      editable: true,
      column: { header: 'Cost' },
    },
    { key: 'team' as const },
    // ADR 0018: the page's own word for the one row it paints as a milestone.
    { key: 'milestone' as const },
  ],
} as const;

/** Root spans that sit beside Program — not in the nested work tree. */
const DEMO_ROOT_SPANS: readonly EntryInput<DemoEntryProps>[] = [
  {
    id: 'ops-oncall',
    name: 'Ops on-call',
    start: shift('2026-09-08'),
    end: shift('2026-09-12'),
    props: { cost: 800, team: 'ops' },
  },
  {
    id: 'staff-training',
    name: 'Staff training',
    start: shift('2026-10-06'),
    end: shift('2026-10-10'),
    props: { cost: 1200, team: 'ops' },
  },
];

// ADR 0013: `kind` left `Entry`, so "Requirements review" is no longer a stored milestone kind.
// ADR 0018: `main.ts` installs one variant whose rule reads the `milestone` Field below, and this
// fixture is what writes it. The page owns the word; core never learns it.
export const MILESTONE_ENTRY_ID = 'entry-4';

/** Generic-demo entries: two root spans, then a four-level Program tree. */
export const demoTreeEntryInputs: EntryInput<DemoEntryProps>[] = [
  ...DEMO_ROOT_SPANS,
  { id: 'program', name: 'Program' },
  ...demoEntryInputs.map((entry, i) => {
    const id = entry.id ?? '';
    const parentId = DEMO_PARENT[id];
    const workstream = workstreamOf(id);
    const team = workstream !== undefined ? WORKSTREAM_TEAM[workstream] : undefined;
    const isLeaf = DEMO_CHILDREN[id] === undefined;
    const props: DemoEntryProps = {
      ...(isLeaf ? { cost: (i + 1) * 250 } : {}),
      ...(team !== undefined ? { team } : {}),
    };
    if (id === MILESTONE_ENTRY_ID) props.milestone = true;
    const next: EntryInput<DemoEntryProps> = { id, name: entry.name };
    // The claimed parent stores no dates — its three legs roll its span up (ADR 0013), the same way
    // every other derived Entry in this tree gets its span.
    const claimsItsChildren = id === CLAIMED_PARENT_ID;
    if (entry.start !== undefined && !claimsItsChildren) next.start = entry.start;
    if (entry.end !== undefined && !claimsItsChildren) next.end = entry.end;
    if (parentId !== undefined) next.parentId = parentId;
    if (Object.keys(props).length > 0) next.props = props;
    return next;
  }),
  ...claimedLegs(),
];

/** The three child Entries that `CLAIMED_PARENT_ID`'s row claims (ADR 0026, #421).
 *
 *  The parent stores no dates: `demoTreeEntryInputs` drops them above, and the Rollup gives it the
 *  span of these three (ADR 0013). Each leg carries its own cost and team, because the parent is
 *  derived now and nothing but the Rollup may write a rolling-up parent's cell. */
function claimedLegs(): EntryInput<DemoEntryProps>[] {
  const parent = demoEntryInputs.find((entry) => entry.id === CLAIMED_PARENT_ID);
  const legs = claimedChildrenOf(CLAIMED_PARENT_ID, parent!.start!, COMPACT_LEGS);
  return legs.map((leg, i) => ({ ...leg, props: { cost: (i + 1) * 250, team: 'edge' } }));
}
