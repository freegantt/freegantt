# A bar is a child Entry — the leading design idea for #421 (Q17)

**Status, 2026-09-17: a proposal. Not ruled. Spike S4 has not run. Do not run it until the author says so.**

This design replaces Option C if spike S4 passes. Builds B1–B8 in [`README.md`](README.md) wait for that answer. If the spike fails, Option C stands as written, with the six fixes at the end of this file.

Every code claim below was measured at `d3ec677`. **A line number is a hint. Open the file.**

The same design, with four diagrams of how a normal bar, a segment bar and a summary bar flow through the system, is published at `docs/08-a-bar-is-an-entry.md`.

---

## The idea

**What #421 calls a Segment is a regular Entry.** Its `parentId` names the row's Entry. Nothing on the child marks it. A rule on the row source says which parents draw their children on their own row. A parent that the rule does not claim shows the same children as sub-rows, with no change to the data.

```ts
const dataset = new Dataset({
  fields: [
    { key: 'type', type: 'text' },
    { key: 'hours', type: 'number', rollUp: 'sum' },
    { key: 'locked', type: 'boolean' },
  ],
  entries: [
    { id: 'req-1', name: 'Framing crew', type: 'request' },              // the row
    { id: 'd1', parentId: 'req-1', start, end, hours: 8 },                // a bar: a plain Entry
    { id: 'd2', parentId: 'req-1', start, end, hours: 4, locked: true },
    { id: 'hold', start, end },                                           // a plain row, as today
  ],
});

new Gantt({
  dataset,
  rowSource: { source: 'entries', tree: true, childrenOnParentRow: { type: 'request' } },
});
```

`childrenOnParentRow` is a placeholder. Run the naming skill before it ships. It says whose row, which `childrenOnRow` did not. Rejected so far: `childrenAsBars` (an unclaimed parent's children draw bars too, on their own rows — the word does not discriminate), `mergeChildRows` (names the mechanism, not the job), `splitRow` ("Split" is under *Avoid* in `CONTEXT.md`).

---

## Why this idea leads

**Option C did not deliver its promise.** The Q6 grill listed eight doubled doors. Q10–Q13 brought seven back:

| Job | Entry door | Segment door under ruled C |
|---|---|---|
| read a value | `entry.read(k)` | `segment.read(k)` |
| write a value | `entries.update` | `entries.updateSegment` |
| add one | `entries.add` | `entries.addSegment` |
| remove | `entries.remove` | `entries.removeSegments` |
| match | `when` | `whenSegment` |
| propose an edit | `EntryEdits` | `SegmentEdits` |
| address a change | `store: 'entries'` | `store: 'segments'` |

Only the optional `segment?` argument went away.

**The issue title lists what an Entry already has:** a name, props, a variant and capabilities. B1–B8 build the Entry a second time under a second name: an id index, a live object cache, props ingest, a ChangeSet store, a Rollup input, variant matching and capability resolution.

**Core already draws several Entries on one Row.**

- `CONTEXT.md`, *Row*: "one Row may carry the Items of many Entries". The `group` row source does this today.
- `layout/rows/entries-source.ts:40` sets `entryIds: [entryId(entry.id)]`. The change is to put the children of a claimed parent into that list and to give them no row.
- `layout/rows/collapse.ts:18-20` already drops the rows of a collapsed parent's descendants. The new rule is the same walk, and it keeps the children's ids on the parent's row.
- `FrameLayoutView.entryIdsForRow` already answers every Entry a row owns, for hit tests and the grid-row click.

**Comparable libraries** (surveyed 2026-09-17; names stay out of this file by the vendor-name rule). One stores a piece as an ordinary child task and draws it on the parent's row, from a rule on the parent. Timeline and scheduler libraries keep bars as flat records with a key that names their row. Both give each bar a stable id, its own data and its own look with no second type. The nested-array libraries address a piece by index, or repeat the task's base class for the piece.

---

## The API, in call sites

Every job uses a door that ships today.

| Job | Call site | New? |
|---|---|---|
| Author a bar with data | `{ id: 'd1', parentId: 'req-1', start, end, hours: 8 }` | no |
| Draw a parent's children on its row | `rowSource: { source: 'entries', tree: true, childrenOnParentRow: { type: 'request' } }` | **the one new key** |
| Read a bar's value | `entry.read('hours')` | no |
| Name the row a bar sits on | `entry.parent()` | no |
| List a row's bars | the parent's children | no |
| Total bar values onto the row | `{ key: 'hours', type: 'number', rollUp: 'sum' }` | no |
| Patch one bar | `dataset.entries.update('d2', { hours: 6 })` | no |
| Add one bar | `dataset.entries.add({ parentId: 'req-1', start, end, hours: 8 })` | no |
| Remove a bar | `dataset.entries.remove('d1')` | no. `remove` takes one id today (`model/dataset.ts:65`); several bars are several calls in one `transaction` |
| Move a bar to another row | `dataset.entries.update('d1', { parentId: 'req-2' })` | no. Option C cannot do this and keep the id |
| Match a bar | `{ name: 'fullDay', when: { hours: 8 }, css }` | no |
| Gate a gesture per bar | `interactions: { resize: (entry) => entry.read('locked') !== true }` | no |
| Format a value | `formatValue: (value, ctx, entry) => …` | no |
| Read the change | `{ store: 'entries', id: 'd2', field: 'hours', from: 4, to: 6 }` | no |
| Propose a cascade | an `EditExtender` returns `EntryEdits` | no |
| Show the same bars as sub-rows | change the rule, or the value it matches | no |

---

## The rule: where it lives, and what it takes

**The value is the `when` pattern.** `childrenOnParentRow` takes a `VariantRule` (`layout/items/variants.ts`): a field match or `(entry) => boolean`. An author learns one match syntax.

**The rule matches the parent.** A claimed parent gives its children no rows and draws them on its own row.

**The rule lives on the row source, not on a variant, and not on the Entry.**

- **The row list keeps one owner.** `resolveRows` (`layout/rows/resolve-rows.ts:71`) takes the entries, the row source and `collapsed`. No variant reaches it. A variant key would give the row list two owners.
- **Nonsense is unrepresentable.** The key exists only on `EntriesRowSource`. A variant key on a Gantt with a `group` source does nothing, and no type refuses it.
- **The glossary already says it.** *Row source*: "Alternative views are new row sources, not new rendering or interaction code." Bars on the row and bars as sub-rows are two views of one Dataset.
- **Two Gantts may differ** (I2). The row source is per Gantt. A stored key on the Entry forces both to agree.
- **It is live.** `gantt.rowSource = { … }` switches the view, as every config key must.

**Per-Entry control comes free, and core stores no classification** (`plans/01` §2.5). The consumer declares a Field of their own and matches it:

```ts
fields: [{ key: 'showDaysOnRow', type: 'boolean' }]
rowSource: { source: 'entries', tree: true, childrenOnParentRow: { showDaysOnRow: true } }
dataset.entries.update('req-1', { showDaysOnRow: false });   // this row opens into sub-rows, undoable
```

**Per-row control is per-Entry control.** For the entries source a `RowId` equals the `EntryId` (`CONTEXT.md`, *Row*). Group and custom rows have no parent Entry, so the rule does not apply to them.

**Refused: a core key on the Entry** (`{ id: 'req-1', render: … }`). Core would read a stored classification, and two Gantts could not differ. The field-match form costs the author one line and keeps both rules.

---

## What it deletes

- Types: `Segment`, `StoredSegment`, `SegmentId`, `SegmentInput`, `SegmentEdit`, `SegmentEdits`, `DatasetEdits`.
- Doors: `updateSegment`, `addSegment`, `removeSegments`, `whenSegment`, `segment.entry()`, `formatValue`'s `owner`, `BarRendererContext.segments`, `moveEntryTo`'s Segment branch, `measureDuration: 'segments'`.
- Errors: `SegmentNotFoundError`, `EmptySegmentsError`, `SegmentsOutOfSyncError`, `DuplicateSegmentIdError`.
- Mechanisms: the minted plain-bar id, the `store: 'segments'` apply path, `envelopeOfSegments`, `reconcileEnvelope`, `fitSegmentsToEnvelope`, `widenSegmentsToEnvelope`, the positional id match.
- Selection: `selectedSegmentIds` and the `segmentIds` half of `DomTarget` and `CommandTarget`. The Selection holds Entry ids.
- Rulings: Q1–Q16 have no subject. Most of B1–B8 has no work.

## What it adds

- **A bar moves to another row with one write**, and keeps its id, its data and its place in the Selection. This is the main gesture of a shift roster.
- **A row filter can hide one bar.** `RowSource.filter` is a predicate on an Entry, so the consumer's "hide filled" filter works per bar.
- **Bar data gets an editor.** A second Gantt, or the same Gantt with the rule off, shows the days as sub-rows with editable grid cells. Option C gives a Segment's values no editor.
- **An id is stable across sessions.** Every bar id is an authored `EntryId`. Option C's plain bar id is a counter (`data/dataset-state.ts:274`).

## What still ships from #421

These jobs do not depend on the Segment type. They stay in scope under either design.

- `Entry.name` becomes optional. Text never decides whether a bar shows.
- A bar names the Field it prints: `barLabels: { field, placement }`, Gantt-wide and per variant.
- Zoom never changes a bar's span or its values.

---

## Costs and open points

Each is a question for the spike or for a grill after it. None is ruled.

1. **Performance.** The Q6 grill called 10,000 child Entries "the decisive objection", and no one measured it. The consumer brief tops out near 4,000 bars. S4 measures this first.
2. **The parent's own bar.** A parent wears `summary()` by default, which would paint over its children. Proposed: core's default for a parent whose children sit on its row is no Item of its own. A consumer variant may still paint a rail.
3. **The Selection unit.** ADR 0010 makes the Segment the unit. Under this design the unit is the Entry. A new ADR revises ADR 0010. A grid-row click selects every Entry the row owns, through `entryIdsForRow`, as it does for a group row.
4. **A child on the row that has children of its own.** Options: refuse it, draw the grandchildren on the same row, or give them rows under the host row.
5. **Mixed children.** The rule matches the parent, so it takes all of that parent's children. A parent with days on its row and sub-tasks below cannot be expressed. The brief has no such case. If one appears, the key gains a long form that also matches the child.
6. **The row is expandable or not.** Proposed: a claimed parent is not expandable. The consumer opens it by changing the rule or the value it matches.
7. **A plain row that gains a child loses its authored dates** (ADR 0013, unchanged). The first bar does not survive as a bar. This is the rule every parent already obeys, so it is not a new one. State it in the consumer docs.
8. **Copy a row with its bars.** `toInput()` copies one Entry. A subtree copy needs its own door. A hierarchy needs that door with or without this design.
9. **Migration.** Segments shipped in S4. 59 non-test sites and 37 test files read `segments` (README table). ADR 0010 and ADR 0012's Segment clauses retire through a new ADR.
10. **S7.** A link to a split piece of work names the parent or one child. The scheduling plugin rules that, not this work.
11. **The name of the key.** Run the naming skill. Read the call site aloud.

---

## Spike S4 — planned, not run

**Wait for the author's word.** Probe code only. Delete it afterwards, as S1–S3 did. Write the findings into `SPIKE-FINDINGS.md` and a **J** in the log.

**Questions.**

1. Does a frame with 10,000 child Entries on claimed rows hold the I5 and S6 budgets? Measure frame build time, Rollup time on one child write, and hover.
2. Do the README's user stories 1 to 5 and 10 to 12 work in the harness with **no change to any Segment code**?
3. What breaks when a row owns a parent and its children? Check selection, the resize handle pair, keyboard order, `reveal` and the a11y labels.

**Method.**

1. Add the key to `EntriesRowSource` and the fold to `resolveEntriesSource`.
2. Suppress the claimed parent's own Item.
3. Build a fixture: 200 parents with 50 children each.
4. Build one crew-lead row in the harness: per-bar text, colour, a locked bar, a row total.
5. Run the existing perf tests and `pnpm verify:full`.

**Pass.** Question 1 holds the budgets. Question 2 needs no workaround in `harness/`. Question 3 finds no fault that needs a second type to fix.

**Estimate.** About 2 hours.

---

## If the spike fails: six fixes to Option C

A cold read of the ruled plan found these on 2026-09-17. They bind only if Option C stands.

1. **`addSegment` on a plain row removes the bar that was there.** The row starts to derive and its authored dates drop. No user story and no test covers the case. Keep the first bar as an authored Segment, or rule the loss and pin it.
2. **The plain bar's id is a counter** (`data/dataset-state.ts:274`). It changes between sessions, and it is public in `selectedSegmentIds`, `reveal` and the DOM targets. Make it equal the `EntryId`.
3. **One key has two homes.** A plain bar reads the Entry's values and an authored Segment does not. A plain bar's write is a `store: 'entries'` row and an authored bar's write is a `store: 'segments'` row, so a consumer's sync code needs two paths. This is inherent to Option C and has no fix inside it.
4. **Segment order is stored state with no visible meaning.** Bars sit by date. Order Segments by `start`, build `Item.id` from the `SegmentId`, and delete user story 13.
5. **One date write answers to two rules.** A drag asks `resize(segment)` and the cell editor asks `edit(entry, 'start')`. #256 had joined them. Rule it.
6. **`toInput()` keeps the Entry's id and drops each Segment's id.** A round trip loses ids. Keep the ids, and give copying its own door.
