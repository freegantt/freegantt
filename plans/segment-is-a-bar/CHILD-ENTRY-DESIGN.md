# A bar is a child Entry — the ruled design for #421 (Q17)

**Status, 2026-09-17: RULED. This is the design #421 builds.** Spike S4 ran and reported a partial pass: the cost objection falls, and shape (a) wins the subject seam ([`SPIKE-FINDINGS.md`](SPIKE-FINDINGS.md)).

**Option C is void.** Its builds B1–B8, its `Segment` stored/live pair and its write doors do not ship. The build order is now C1–C7 in [`README.md`](README.md). `BUILD-LOG.md` keeps Option C's text as the record of what was refused and why — read the table at the top of that file, never an old body. This file's closing section says what Option C was, in one paragraph.

Every code claim below was measured at `d3ec677` and re-checked at `496ed77`. **A line number is a hint. Open the file.**

The same design, with four diagrams of how a normal bar, a child bar and a summary bar flow through the system, is published at `docs/08-a-bar-is-an-entry.md`.

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
  rowSource: { source: 'entries', childrenAsSegments: { showDaysOnRow: true } },
});
```

Two rows come out: `req-1` with `d1` and `d2` as bars, and `hold`. The call names no `tree`, because nothing nests here. `tree` is orthogonal to the rule — see *The rule's scope* below.

**The name is ruled**, 2026-09-17 by the author: `childrenAsSegments`. The reasoning, the rejected names, and the one cost it carries are in [`README.md`](README.md).

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
| Draw every parent's children on its row | `rowSource: { source: 'entries', childrenAsSegments: true }` | **the one new key** |
| Draw one parent's children on its row | `rowSource: { source: 'entries', childrenAsSegments: { showDaysOnRow: true } }` | the same key |
| Open one row into sub-rows, live | `dataset.entries.update('req-1', { showDaysOnRow: false })` | no |
| Put a summary row above a claimed row | `rowSource: { source: 'entries', tree: true, childrenAsSegments: { showDaysOnRow: true } }` | the same key |
| Read a bar's value | `entry.read('hours')` | no |
| Name the row a bar sits on | `entry.parent()` | no |
| List a row's bars | the parent's children | no |
| Total bar values onto the row | `{ key: 'hours', type: 'number', rollUp: 'sum' }` | no |
| Patch one bar | `dataset.entries.update('d2', { hours: 6 })` | no |
| Add one bar | `dataset.entries.add({ parentId: 'req-1', start, end, hours: 8 })` | no |
| Remove a bar | `dataset.entries.remove('d1')` | no. `remove` takes one id today (`model/dataset.ts:65`); several bars are several calls in one `transaction` |
| Move a bar to another row | `dataset.entries.update('d1', { parentId: 'req-2' })` | no. Option C cannot do this and keep the id |
| Match a bar | `{ name: 'fullDay', when: { hours: 8 }, css }` | no |
| Gate a gesture per bar | `capabilities: { resize: (entry) => entry.read('locked') !== true }` | no |
| Format a value | `formatValue: (value, ctx, entry) => …` | no |
| Read the change | `{ store: 'entries', id: 'd2', field: 'hours', from: 4, to: 6 }` | no |
| Propose a cascade | an `EditExtender` returns `EntryEdits` | no |
| Show the same bars as sub-rows | change the rule, or the value it matches | no |

---

## The rule: where it lives, and what it takes

**The value is the `when` pattern.** `childrenAsSegments` takes `true`, or a `VariantRule` (`layout/items/variants.ts`): a field match or `(entry) => boolean`. An author learns one match syntax. `true` is the shorthand for the common case; the rule is the expert form.

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
childrenAsSegments: true                                       // every parent
childrenAsSegments: { team: 'framing' }                        // any value the data already holds
childrenAsSegments: { showDaysOnRow: true }                    // the parents the consumer marks
childrenAsSegments: (entry) => entry.read('ownRows') !== true  // every parent, minus the opened ones
```

**A field match is a Field key and a value.** `{ showDaysOnRow: true }` claims the parents whose `showDaysOnRow` Field equals `true`; the comparison is that Field's own `equals` (`model/field.ts`), and a key no Field declares claims nothing (`variants.ts`) — reporting once per rule and key through `reportUnknownFieldMatch`, the sink `J59` already built, so a typo here is as loud as a typo in a variant's `when`. **It does not name or pick a variant.** `EntryVariant.when` writes the same shape for a different question — `when` asks how a row looks, this key asks whether a parent gives its children rows. A claimed parent's children resolve their own variants afterwards, which is the per-bar look #421 asks for.

**Refused as an example: a consumer Field called `type`** (`{ type: 'request' }`, the first draft). It reads as a stored classification, which core does not have (ADR 0013), and it collides with `Field.type` in the same `fields` block — `{ key: 'type', type: 'text' }`. A consumer may still declare such a Field; the docs must not teach one.

**Per Entry, the marker is a consumer Field, and core stores no classification** (`plans/01` §2.5):

```ts
fields: [{ key: 'showDaysOnRow', type: 'boolean' }]
rowSource: { source: 'entries', childrenAsSegments: { showDaysOnRow: true } }
dataset.entries.update('req-1', { showDaysOnRow: false });   // this row opens into sub-rows
```

That write is one transaction, one `ChangeSet` row, one undo step. A grid checkbox drives it with no new API.

**Default on with a per-Entry opt-out is a predicate**, not a field match: a match is equality (`variants.ts`), and a Field declares no default value. `(entry) => entry.read('ownRows') !== true` is the whole opt-out.

**Per-row control is per-Entry control.** For the entries source a `RowId` equals the `EntryId` (`CONTEXT.md`, *Row*). Group and custom rows have no parent Entry, so the rule does not apply to them.

**Refused: a core key on the Entry** (`{ id: 'req-1', childrenAsSegments: true }`). Core would read a stored classification, and two Gantts could not differ (I2) — one draws the days as bars, the other shows them as editable rows. The consumer Field costs the author one line and keeps both rules.

---

## `tree` is orthogonal to the rule

`tree` decides whether an **unclaimed** parent's children nest under it. The rule decides whether a **claimed** parent's children become rows at all. Neither reads the other.

| `tree` | `childrenAsSegments` | Rows |
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
rowSource: { source: 'entries', tree: true, childrenAsSegments: { showDaysOnRow: true } }
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
- Rulings: Q1–Q16 have no subject. Option C's builds B1–B8 have no work, and C1–C7 replace them.

## What it adds

- **A bar moves to another row with one write**, and keeps its id, its data and its place in the Selection. This is the main gesture of a shift roster.
- ~~**A row filter can hide one bar.**~~ **Withdrawn 2026-09-17: this does not follow, and no code does it.** `RowFilter` is a predicate on an Entry, but `filter.ts:8-10` reads one Entry per row (`entryIds[0]`) and `applyFilter` keeps or drops **whole rows** (`:69-76`). Items are produced only after a row survives, so nothing filters an Entry off a shared row today. Hiding one bar needs a new item-level knob, and no such knob ships. **Q20, ruled by the author 2026-09-17: it does not need to.** A filter hides a parent, and its segments go with it, because they sit on the parent's row. That is what `applyFilter` already does, so nothing ships. See J-plan-F in the table below.
- **Bar data gets an editor.** A second Gantt, or the same Gantt with the rule off, shows the days as sub-rows with editable grid cells. Option C gives a Segment's values no editor.
- **An id is stable across sessions.** Every bar id is an authored `EntryId`. Option C's plain bar id is a counter (`data/dataset-state.ts:274`).

## What still ships from #421

These jobs do not depend on the Segment type. They stay in scope under either design.

- `Entry.name` becomes optional. Text never decides whether a bar shows.
- A bar names the Field it prints: `barLabels: { field, placement }`, Gantt-wide and per variant.
- Zoom never changes a bar's span or its values.

---

## What is ruled, and what still waits

Spike S4 ran on 2026-09-17 and reported a partial pass. The evidence is in [`SPIKE-FINDINGS.md`](SPIKE-FINDINGS.md); the rulings are `J-plan-A` to `J-plan-I` in [`README.md`](README.md) and the table at the top of [`BUILD-LOG.md`](BUILD-LOG.md). Every point below was an open point in the proposal. Nothing here is re-opened casually.

| # | The point | Ruling |
|---|---|---|
| 1 | **Performance.** The Q6 grill called 10,000 child Entries "the decisive objection" | **The objection falls.** A frame builds 20% cheaper as child Entries. The write and the row resolution grew, and each halves once the Rollup stops re-deriving an index the store already memoizes (C4). A **browser** measurement of the hot path is still owed |
| 2 | **The parent's own bar** | **Core draws no bar Item for a claimed parent.** C2 builds it, and the rail seam with it |
| 3 | **The Selection unit** | **The Entry.** A new ADR revises ADR 0010. C6 |
| 4 | **A claimed child that has children of its own** | **J-plan-I: a claim is a collapse, one level deeper.** The claimed parent draws its direct children as bars; the subtree below loses its rows, and a child that derives draws one rolled-up bar, as a collapsed parent does today |
| 5 | **Mixed children** — bars of its own *and* child rows below | **Not expressible, and not in scope.** The brief has no such case |
| 6 | **Is a claimed row expandable?** | **J-plan-C: no**, in flat or tree mode. The consumer opens it by writing the Field the rule matches |
| 7 | **A plain row that gains a child loses its authored dates** (ADR 0013) | Unchanged, and not new. C7 states it in the consumer docs |
| 8 | **Copy a row with its bars** | Out of scope. A hierarchy needs a subtree-copy door with or without this design |
| 9 | **Migration** | **J-plan-G: the Segment retires with no legacy.** One ADR settles it. C6 |
| 10 | **S7** | The scheduling plugin rules a link to a child bar, not this work |
| 11 | **The name of the key** | **RULED: `childrenAsSegments`.** It frees the word *Segment* from the retiring type and gives it one meaning: a child Entry drawn as one piece of its parent's row. C1 rewrites `CONTEXT.md`'s entry the day the key lands |
| 12 | **Where the claimed parent's suppression lives, and where a rail could live** (Q19) | **Shape (a).** `entryIds[0]` stays the subject and `PlannedRow` carries the claimed marker. C2 builds the rail seam |
| 13 | **`entryIds[0]` is an unwritten convention** | **Nine reads, in seven files** — seven of a row's list, two of the Selection's own. C3 audits and fixes all of them. *The spike's "a tenth site the design doc does not count" is a miscount, checked against the code 2026-09-17: `view/segment-selection.ts:170` was already in the list of nine* |
| 14 | **Overlapping bars on one row** | **J-plan-E.** They draw at the shared band; the later id in `row.entryIds` paints on top; `hitTest` already answers the topmost element. Lane packing stays retired (#298) |
| 15 | **Two ADRs before the builds are worth planning** | Confirmed. The Selection unit and the Segment's retirement, both in C6 |
| — | **An empty claimed parent** | **J-plan-D: a blank row.** It is what a dateless row already draws |
| — | **A filter and a shared row** (Q20) | **J-plan-F: a filter hides a parent, and its segments go with it.** That is what `applyFilter` already does, so nothing ships. A filter cannot keep some of a row's segments and drop others |
| — | **A vertical drag to another row** | The write ships today. The **gesture** does not — `interaction/` reads no hovered row at commit. Split out as **#425** |

### The three questions the spike left, and what the author ruled

All three were put to the author on 2026-09-17. Two are ruled and land in C1.

1. **The Field-registry gap — RULED: thread it.** `childrenAsSegments`'s field match cannot reuse `layout/items/variants.ts`'s `compileRule` without a `fieldContext`, which `row-source.ts` says the entries source does not take (D-S4-19, D-S4-21). C1 threads it, so the match uses each Field's own `equals` and a key no Field declares reports once through `reportUnknownFieldMatch`. **Why it won:** a misspelt key would otherwise claim nothing and draw a blank screen, in silence — the fault class #197 closed. `RowPassInput` already carries `fieldContext` for `sort`, so the wire exists; what changes is what `row-source.ts` says about itself, and C1 rewrites that comment.
2. **The `boolean` Field type — RULED: core ships it.** `FieldTypeName` (`model/field.ts:14`) ships `text`, `number`, `percent`, `date` and `duration` today, so `{ key: 'showDaysOnRow', type: 'boolean' }` throws `UnknownFieldTypeError` at `data/fields/field-registry.ts:70`. It lands in C1, with ingest, `formatValue`, `parseValue`, `compare` and `equals`, because the rule's own examples are the first consumer of it.
3. **Does a hierarchy source declare the keys it reads? — still open (Q23).** C4's fast path applies only to core's own `storedParentSource`, because a plugin source is a function that may read any field. A source that named its keys would let every source skip the re-check. Wider than #421, and it blocks nothing here.

### Everything still open, in one list

**Three questions are open on 2026-09-17. None of them blocks C1.**

| # | Question | Who waits on it |
| --- | --- | --- |
| **Q23** | does a hierarchy source declare the Field keys it reads? | Nobody. C4's fast path ships without it |
| **Q27** | a claimed parent draws no bar — so how does core's own `summary()` not draw one, and what lets a consumer put a band back? | **C2.** It has a recommendation in `BUILD-LOG.md` and no ruling |
| **Q28** | is the layout unit a `Bar`, not an `Item`? | **C6.** *Item* already names three things in `src/**`, and everything downstream calls it a bar. Recommendation, no ruling |

Two more were raised on the same day and the author ruled both the same day. They are in `BUILD-LOG.md`:

- **Q25** — `measureDuration: 'segments'` becomes `measureDuration: 'children'`. Overlap has no rule of its own: core adds the children, and never reads them for overlap. C6 does the rename.
- **Q26** — a claimed parent draws no bar of its own, and **core ships nothing else**: no rail key, no rail concept, no helper. A consumer may put a band back on a variant of their own. **Q27 holds the mechanism**, because core's shipped `summary()` also names an `items` producer.

**No build invents an answer to an open question.** It stops and asks the author. That rule is why C1 can start today.

---

## The record: what Option C was, and why it is void

Option C ruled that every bar is a `Segment`, a stored/live pair beside the Entry, with its own write doors. It is void. The table under *Why this idea leads* above is the reason: Q10–Q13 brought back seven of the eight doubled doors the Q6 grill chose Option C to remove.

`BUILD-LOG.md` keeps Q1–Q16 and the earlier README text as the record. The six cold-read fixes to Option C that closed this file in its proposal form are void with it, and were removed on 2026-09-17: they bound only if the spike failed, and it did not.
