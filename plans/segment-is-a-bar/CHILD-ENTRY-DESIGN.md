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
    { key: 'showDaysOnRow', type: 'boolean' },
    { key: 'hours', type: 'number', rollUp: 'sum' },
    { key: 'locked', type: 'boolean' },
  ],
  entries: [
    { id: 'req-1', name: 'Framing crew', showDaysOnRow: true },          // the row
    { id: 'd1', parentId: 'req-1', start, end, hours: 8 },                // a bar: a plain Entry
    { id: 'd2', parentId: 'req-1', start, end, hours: 4, locked: true },
    { id: 'hold', start, end },                                           // a plain row, as today
  ],
});

new Gantt({
  dataset,
  rowSource: { source: 'entries', childrenOnParentRow: { showDaysOnRow: true } },
});
```

Two rows come out: `req-1` with `d1` and `d2` as bars, and `hold`. The call names no `tree`, because nothing nests here. `tree` is orthogonal to the rule — see *The rule's scope* below.

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

- `CONTEXT.md`, *Row*: "one Row may carry the Items of many Entries". **The `custom` row source does this today** — `CustomRow.entryIds` is a list, and `resolveCustomSource` maps every id onto one row (`custom-source.ts:14,20`). *Corrected 2026-09-17: this bullet used to cite the `group` source, which does not do it — `group-source.ts:40` gives every member its own row with `entryIds: [id]`, and only the header row is shared, with `entryIds: []`.*
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
| Draw every parent's children on its row | `rowSource: { source: 'entries', childrenOnParentRow: true }` | **the one new key** |
| Draw one parent's children on its row | `rowSource: { source: 'entries', childrenOnParentRow: { showDaysOnRow: true } }` | the same key |
| Open one row into sub-rows, live | `dataset.entries.update('req-1', { showDaysOnRow: false })` | no |
| Put a summary row above a claimed row | `rowSource: { source: 'entries', tree: true, childrenOnParentRow: { showDaysOnRow: true } }` | the same key |
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

**The value is the `when` pattern.** `childrenOnParentRow` takes `true`, or a `VariantRule` (`layout/items/variants.ts`): a field match or `(entry) => boolean`. An author learns one match syntax. `true` is the shorthand for the common case; the rule is the expert form.

**The rule matches the parent.** A claimed parent gives its children no rows and draws them on its own row.

**The rule lives on the row source, not on a variant, and not on the Entry.**

- **The row list keeps one owner.** `resolveRows` (`layout/rows/resolve-rows.ts:71`) takes the entries, the row source and `collapsed`. No variant reaches it. A variant key would give the row list two owners.
- **Nonsense is unrepresentable.** The key exists only on `EntriesRowSource`. A variant key on a Gantt with a `group` source does nothing, and no type refuses it.
- **The glossary already says it.** *Row source*: "Alternative views are new row sources, not new rendering or interaction code." Bars on the row and bars as sub-rows are two views of one Dataset.
- **Two Gantts may differ** (I2). The row source is per Gantt. A stored key on the Entry forces both to agree.
- **It is live.** `gantt.rowSource = { … }` switches the view, as every config key must.

---

## The rule's scope: Gantt-wide, and per Entry

**One key does both.** The rule runs once per parent Entry in the layout pass, so what it scopes is whatever it asks:

```ts
childrenOnParentRow: true                                       // every parent
childrenOnParentRow: { team: 'framing' }                        // any value the data already holds
childrenOnParentRow: { showDaysOnRow: true }                    // the parents the consumer marks
childrenOnParentRow: (entry) => entry.read('ownRows') !== true  // every parent, minus the opened ones
```

**A field match is a Field key and a value.** `{ showDaysOnRow: true }` claims the parents whose `showDaysOnRow` Field equals `true`; the comparison is that Field's own `equals` (`model/field.ts`), and a key no Field declares claims nothing (`variants.ts`). **It does not name or pick a variant.** `EntryVariant.when` writes the same shape for a different question — `when` asks how a row looks, this key asks whether a parent gives its children rows. A claimed parent's children resolve their own variants afterwards, which is the per-bar look #421 asks for.

**Refused as an example: a consumer Field called `type`** (`{ type: 'request' }`, the first draft). It reads as a stored classification, which core does not have (ADR 0013), and it collides with `Field.type` in the same `fields` block — `{ key: 'type', type: 'text' }`. A consumer may still declare such a Field; the docs must not teach one.

**Per Entry, the marker is a consumer Field, and core stores no classification** (`plans/01` §2.5):

```ts
fields: [{ key: 'showDaysOnRow', type: 'boolean' }]
rowSource: { source: 'entries', childrenOnParentRow: { showDaysOnRow: true } }
dataset.entries.update('req-1', { showDaysOnRow: false });   // this row opens into sub-rows
```

That write is one transaction, one `ChangeSet` row, one undo step. A grid checkbox drives it with no new API.

**Default on with a per-Entry opt-out is a predicate**, not a field match: a match is equality (`variants.ts`), and a Field declares no default value. `(entry) => entry.read('ownRows') !== true` is the whole opt-out.

**Per-row control is per-Entry control.** For the entries source a `RowId` equals the `EntryId` (`CONTEXT.md`, *Row*). Group and custom rows have no parent Entry, so the rule does not apply to them.

**Refused: a core key on the Entry** (`{ id: 'req-1', childrenOnParentRow: true }`). Core would read a stored classification, and two Gantts could not differ (I2) — one draws the days as bars, the other shows them as editable rows. The consumer Field costs the author one line and keeps both rules.

---

## `tree` is orthogonal to the rule

`tree` decides whether an **unclaimed** parent's children nest under it. The rule decides whether a **claimed** parent's children become rows at all. Neither reads the other.

| `tree` | `childrenOnParentRow` | Rows |
|---|---|---|
| `false` (default) | none | every Entry, flat, `grid` (`entries-source.ts:48-50`) |
| `false` | claims `req-1` | `req-1` with two bars; `d1`/`d2` get no rows. Still a flat `grid` |
| `true` | none | `d1`/`d2` nest at `depth + 1`, chevron, `treegrid` |
| `true` | claims `req-1` | `req-1` holds the bars; an unclaimed parent still nests |

**Consequence for the build.** `resolveEntriesSource` returns early in the flat branch today (`entries-source.ts:48`) and never builds the parent index. The fold needs `entryTreeIndex` in both branches. `nestsRows` (`row-source.ts:107`) keeps reading `tree` alone, so a claimed flat source stays a `grid` and no row carries `aria-level` it cannot justify.

**A claimed parent is never expandable**, in either mode. Tree mode sets `expandable: children.length > 0` (`entries-source.ts:69`); a claimed parent's children have no rows, so the fold must clear it. Open point 6 below.

---

## A summary row above a claimed row

**This composes, and no stage learns a new case.** The rule claims the parents that carry bars. Their own parent is unclaimed, so it keeps its row, wears `summary()` and rolls up as today:

```ts
entries: [
  { id: 'site-a', name: 'Site A' },                                        // a summary row
  { id: 'req-1', parentId: 'site-a', name: 'Framing crew', showDaysOnRow: true },
  { id: 'req-2', parentId: 'site-a', name: 'Roofing crew', showDaysOnRow: true },
  { id: 'd1', parentId: 'req-1', start, end, hours: 8 },
  { id: 'd2', parentId: 'req-1', start, end, hours: 4 },
]
rowSource: { source: 'entries', tree: true, childrenOnParentRow: { showDaysOnRow: true } }
```

Three rows: `site-a` (rail, collapses through the chevron), `req-1` and `req-2` (each carrying its days as bars). The Rollup is one bottom-up pass over the whole tree, so `site-a`'s `hours` totals every day under both crews. No pass asks whether it draws its children's bars.

**A claimed row is already a summary in the grid.** Its cells roll up from its children (ADR 0013) — `req-1` reads 12 h. The design suppresses the claimed parent's own bar `Item` only, so the rail does not paint over the children it stands for. A consumer variant may still paint a rail behind them.

**What this does not express:** `site-a` carrying bars of its own *and* child rows. That is the mixed-children point (open point 5).

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
- ~~**A row filter can hide one bar.**~~ **Withdrawn 2026-09-17: this does not follow, and no code does it.** `RowFilter` is a predicate on an Entry, but `filter.ts:8-10` reads one Entry per row (`entryIds[0]`) and `applyFilter` keeps or drops **whole rows** (`:69-76`). Items are produced only after a row survives, so nothing filters an Entry off a shared row today. Hiding one bar needs a new item-level knob. Q20 below.
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
4. **A child on the row that has children of its own.** Options: refuse it, draw the grandchildren on the same row, or give them rows under the claimed parent's row. `childrenOnParentRow: true` on a tree three levels deep meets this at once, which is why a deeper dataset names its level with a match. Rule this before the `true` shorthand ships.
5. **Mixed children.** The rule matches the parent, so it takes all of that parent's children. A parent with days on its row and sub-tasks below cannot be expressed. A summary row **above** a claimed row does work, and is written up above — this is the other direction. The brief has no such case. If one appears, the key gains a long form that also matches the child.
6. **The row is expandable or not.** Proposed: a claimed parent is not expandable, in flat and in tree mode. The consumer opens it by writing the Field the rule matches. An unclaimed parent above it keeps its chevron.
7. **A plain row that gains a child loses its authored dates** (ADR 0013, unchanged). The first bar does not survive as a bar. This is the rule every parent already obeys, so it is not a new one. State it in the consumer docs.
8. **Copy a row with its bars.** `toInput()` copies one Entry. A subtree copy needs its own door. A hierarchy needs that door with or without this design.
9. **Migration.** Segments shipped in S4. 59 non-test sites and 37 test files read `segments` (README table). ADR 0010 and ADR 0012's Segment clauses retire through a new ADR.
10. **S7.** A link to a split piece of work names the parent or one child. The scheduling plugin rules that, not this work.
11. **The name of the key.** Run the naming skill. Read the call site aloud.
12. **Where the claimed parent's suppression lives, and where a rail could live** (Q19). `produceItemsForRow(row, entryById, registry)` loops `row.entryIds` and resolves a variant per Entry (`produce-items.ts:29-45`). Nothing in that signature says the row claims its parent, or which of its Entries is the parent. So "core draws no Item for a claimed parent" and "a consumer variant may still paint a rail" are the **same unruled seam**, and neither is expressible today.
13. **`entryIds[0]` is an unwritten convention at nine sites**, and this design is what makes it load-bearing. `render/dom/index.ts:963` states the concept in a comment — "The Entry this row's cells describe (#185) — the row's subject, not the set it owns" — and expresses it positionally. The other eight: `render/dom/index.ts:1039`, `view/gantt-shell.ts:1480`, `view/segment-selection.ts:170`, `view/roving-focus.ts:311`, `layout/rows/sort.ts:53-54`, `layout/rows/filter.ts:9`, `layout/frame.ts:330`. Today an entries-source row holds exactly one id, so `[0]` is unambiguous. A claimed row holds N+1, and every one of those sites silently changes meaning. Q19 rules it.
14. **Overlapping bars on one row have no vertical answer.** Lane packing is retired (#298, `CONTEXT.md`, *Row*): every Item on a Row draws at one shared band. Authored Segments rarely overlapped; two child Entries with overlapping dates are trivial to author. What draws on top, and what does a hit test return? This question did not exist under Option C.
15. **Two ADRs, before B1–B8 are worth planning** (findings 8 and 9).
    - **The Selection unit** revises ADR 0010, and it is a build, not a delete. 16 non-test files name `segmentIds`, plus `view/segment-selection.ts` as its own module: `FrameBar.segmentIds`, `Item.segmentId` (`item.ts:93-102`), `segmentIdsByItem`/`segmentIdsOfEntries` (`frame-memory.ts:96-130`), `segmentIdsForItem` (`frame-layout.ts:142`), the `data-segment-id` DOM stamps, `reveal`'s dual resolution, and the keyboard path.
    - **The Segment retires with no legacy.** Segments shipped in S4 and this library has never shipped to a user (CLAUDE.md), so the clean read is to delete the `segments` Field key outright rather than carry a migration. One ADR settles it and retires ADR 0012's Segment clauses with it.

---

## Spike S4 — planned, not run

**Wait for the author's word.** Probe code only. Delete it afterwards, as S1–S3 did. Write the findings into `SPIKE-FINDINGS.md` and a **J** in the log.

**Measure the baseline before you write a line of the design.** Step 0 below is not optional and not a formality: a number taken after the change, with nothing to compare it against, answers nothing.

### Questions

**Cost.**

1. **The baseline.** What do 10,000 bars cost **today**, on the shipped Segment design? Frame build, Rollup on one write, hover, and the `applyState` hot path. Write the numbers down before anything changes.
2. **The comparison.** What do the same 10,000 bars cost as child Entries on claimed rows? Same four measurements, same fixture shape, same machine, same run. Report the delta, not the absolute. The Q6 grill called this "the decisive objection" and nobody has measured it.
3. Do both hold the I5 and S6 budgets?

**The unruled seams** (each is an open point above, and each is a real seam, not a nit).

4. **Q19 — where does the claimed row name its own Entry?** `entryIds[0]` means "the row's subject" at nine sites today (open point 13) and a claimed row breaks the convention. Write all three shapes and read the call sites:
   - a) the subject stays `entryIds[0]` and `PlannedRow` gains a claimed marker that `produceItemsForRow` reads;
   - b) `PlannedRow` names the subject in its own field, and `entryIds` becomes what it says — the Entries whose Items this row draws. The claimed parent is then simply not in the list, so **no suppression logic exists at all**;
   - c) something else the code asks for while you write it.
   Shape (b) looks like it dissolves the suppression, which makes the rail the question instead: with the parent out of `entryIds`, no variant resolves for it, so how does a consumer paint one? Do not rule this from the plan. Write it.
5. **Q20 — can a filter hide one bar on a shared row?** `applyFilter` keeps or drops whole rows (`filter.ts:69-76`). Decide: refuse it and say so, or add an item-level knob. Name the cost of each.
6. **Overlap.** Two children on one row with overlapping dates. Lane packing is retired, so both draw at one band. What is on top, and what does a hit test return? (Open point 14.)
7. **Two Gantts, one Dataset, different rules** (I2). One draws the days as bars; the other shows them as rows with editable cells. This is the whole reason a core key on the Entry was refused, so the spike must show it working.

**The behaviour.**

8. Do the README's user stories 1 to 5 and 10 to 12 work in the harness with **no change to any Segment code**?
9. What breaks when a row owns a parent and its children? Check selection, the resize handle pair, keyboard order, `reveal` and the a11y labels.
10. Does a per-Entry write switch one row live? `entries.update('req-1', { showDaysOnRow: false })` must open that row into sub-rows in one undo step, leave every other row alone, and **undo back** to the claimed shape with the Selection intact.
11. Does a summary row above a claimed row hold? Three levels, `tree: true`: the grandparent keeps its rail, its chevron and a Rollup over every grandchild.
12. **An empty claimed parent.** The rule claims a parent with no children. It draws no bars, and core draws no Item for it. Is a blank row the right answer, or does the rule not apply?
13. **Drag a bar to another row.** The design's headline win is one write (`update('d1', { parentId: 'req-2' })`). Does a vertical drag reach that write today, or is the gesture missing? Name what is missing; do not build it.

**The shape.**

14. **Is there a better API than the one this plan drew?** The plan is a proposal, and the spike is the first code to meet it. Write each call site down and read it aloud as you go. Log every place the code wanted a different shape — a different key, a different value, a different owner — even when the planned shape works. A spike that only confirms the plan has not looked.

### Method

0. **Baseline first.** Build the 10,000-bar fixture on the shipped Segment design — 200 rows of 50 Segments — and record question 1's four numbers. Commit nothing; write them into `SPIKE-FINDINGS.md` immediately.
1. Add the key to `EntriesRowSource` and the fold to `resolveEntriesSource` — **both branches**, flat and tree — and clear `expandable` on a claimed parent.
2. Answer Q19 by writing shapes (a) and (b), not by choosing one on paper.
3. Build the matching 10,000-bar fixture as child Entries: 200 parents with 50 children each. Re-run the four measurements.
4. Build one crew-lead row in the harness: per-bar text, colour, a locked bar, a row total. Mark the claimed parent with a consumer Field, and put a toggle on it.
5. Build a second fixture three levels deep: one site, two crews, days under each crew.
6. Build a two-Gantt page on one Dataset, one with the rule and one without (question 7).
7. Run the existing perf tests and `pnpm verify:full`.

### Pass

- Questions 1–3: the child-Entry frame holds the I5 and S6 budgets, **and** its delta against the baseline is one the author accepts.
- Question 4: one of the three shapes reads well enough at its call sites that the author would ship it.
- Question 8: no workaround in `harness/`. A workaround is an API gap, and it is the finding, not a detour (CLAUDE.md's stop rule).
- Question 9: no fault that needs a second type to fix.
- Questions 5, 6, 12, 13: each has a written answer. "We will decide later" is not one.

**Two ADRs follow a pass**, before B1–B8 are worth planning: the Selection unit (revising ADR 0010) and the Segment's retirement with no legacy. Open point 15.

**Estimate.** About 4 hours — the baseline, the second fixture, the two Q19 shapes and the two-Gantt page are new since the 2-hour figure.

---

## If the spike fails: six fixes to Option C

A cold read of the ruled plan found these on 2026-09-17. They bind only if Option C stands.

1. **`addSegment` on a plain row removes the bar that was there.** The row starts to derive and its authored dates drop. No user story and no test covers the case. Keep the first bar as an authored Segment, or rule the loss and pin it.
2. **The plain bar's id is a counter** (`data/dataset-state.ts:274`). It changes between sessions, and it is public in `selectedSegmentIds`, `reveal` and the DOM targets. Make it equal the `EntryId`.
3. **One key has two homes.** A plain bar reads the Entry's values and an authored Segment does not. A plain bar's write is a `store: 'entries'` row and an authored bar's write is a `store: 'segments'` row, so a consumer's sync code needs two paths. This is inherent to Option C and has no fix inside it.
4. **Segment order is stored state with no visible meaning.** Bars sit by date. Order Segments by `start`, build `Item.id` from the `SegmentId`, and delete user story 13.
5. **One date write answers to two rules.** A drag asks `resize(segment)` and the cell editor asks `edit(entry, 'start')`. #256 had joined them. Rule it.
6. **`toInput()` keeps the Entry's id and drops each Segment's id.** A round trip loses ids. Keep the ids, and give copying its own door.
