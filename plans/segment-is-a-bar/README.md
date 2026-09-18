# A bar is a child Entry — the build plan for #421

[#421](https://github.com/Pawel-IT/FreeGantt/issues/421) is the spec. **This plan does not restate it.** Read the issue once, then this file, then work one build. Open questions and lone calls go in [`BUILD-LOG.md`](BUILD-LOG.md).

**Ruled 2026-09-17: Q17 passes. A bar is a regular child Entry, and a row source rule draws a claimed parent's children on its row.** The design is [`CHILD-ENTRY-DESIGN.md`](CHILD-ENTRY-DESIGN.md), the evidence is [`SPIKE-FINDINGS.md`](SPIKE-FINDINGS.md), and the consumer page is [`docs/08-a-bar-is-an-entry.md`](../../docs/08-a-bar-is-an-entry.md). **The Segment retires.**

**Option C is void.** Its build order B1–B8, its `Segment` stored/live pair, its write doors and its rulings Q1–Q16 describe a type this library will not ship. `BUILD-LOG.md` keeps that text as the record of what was refused and why. **Read the table at the top of the log, never an old body.**

Line numbers below were measured at `496ed77`. **A line number is a hint. Open the file.**

---

## The rule, in one line

**What #421 calls a Segment is an ordinary Entry whose `parentId` names its row.** Nothing on the child marks it. A rule on the row source says which parents draw their children on their own row. A parent the rule does not claim shows the same children as sub-rows, with no change to the data.

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
  barLabels: { field: 'hours', placement: 'inside' },
  capabilities: { resize: (entry) => entry.read('locked') !== true },
});
```

Two rows: `req-1` carrying `d1` and `d2` as bars, and `hold`. Every job — read, write, add, remove, match, gate, format, cascade — uses the Entry door that ships today.

---

## Hard rules

1. **The issue decides. This plan orders.** When the two disagree, the issue wins, and you log a **Q**.
2. **No second type.** A bar is an `Entry`. A build that adds a per-bar type, a per-bar id or a per-bar write door has left this design. Stop and log a **Q**.
3. **No stored classification.** Nothing on a public type says "bar", "segment", "hidden" or names a variant. The claim is a rule on the row source, matched against the data the consumer already stores. `plans/01` §2.5, ADR 0013, ADR 0018.
4. **The row source owns the row list.** The rule lives on `EntriesRowSource`, never on a variant and never on an Entry. Two Gantts on one Dataset may disagree (I2), and `gantt.rowSource = …` switches the view live.
5. **`tree` is orthogonal.** `tree` decides whether an **unclaimed** parent's children nest. The rule decides whether a **claimed** parent's children become rows at all. Neither reads the other.
6. **An unclaimed parent is untouched, and that is a gate, not an assumption.** A parent no rule claims keeps its own row, gives each child a row, wears `summary()`'s rail and rolls up exactly as it does today — whether the Gantt sets no rule at all, or sets one this parent does not match. The suppression reads the claimed marker on the row (Q19 shape (a)); a row with no marker takes the path it takes now. **C2 pins this with a test, and C7 keeps it: today's layout snapshots must not move.**
7. **The rule matches the parent** with the same `when` pattern a variant uses: `true`, a field match, or `(entry) => boolean`. An author learns one match syntax.
8. **The Rollup is unchanged in shape.** A claimed parent is an ordinary rolling-up parent: its cells, `start`/`end` included, roll up from its children through the normal Aggregators (ADR 0013). A claimed row is already a summary in the grid.
9. **Text never decides whether a bar shows.** An empty label leaves geometry, fill, hit target, hover, selection and handles unchanged. One test pins this.
10. **Zoom never changes a bar's span or its values.** No folding, no read of the visible range. A test pins the same printed value at day, week and year zoom.
11. **A shared row resolves per Entry.** Capabilities, variants, labels, handles and hit tests answer for the Entry the Item carries, never for the row's subject. `entryIds[0]` means the row's subject and nothing else (Q19, shape (a)).

    **Nine `entryIds[0]` reads, in seven files, and they are two different jobs.** Seven read a **row's** list — `render/dom/index.ts:964,1039`, `view/roving-focus.ts:311`, `layout/rows/sort.ts:53-54`, `layout/rows/filter.ts:9`, `layout/frame.ts:330` — and each one means "the row's subject". They change meaning when a row holds N+1 ids. Two read the **Selection's** own list — `view/gantt-shell.ts:1480`, `view/segment-selection.ts:170` — and mean "the first selected Entry". They change meaning when several bars of one row are selected. Both sets are C3's job.
12. **Every write is one transaction, one ChangeSet.** A bar's value write is an ordinary `store: 'entries'` row keyed by the bar's `EntryId`. There is no second store.
13. **The hot path allocates nothing (I5).** The claim rule runs in the layout pass, never per pointer move.
14. **All date arithmetic goes through `time/`.** A bar moves and resizes through the bound `TimeScale`.
15. **The harness never patches the library.** A cast, a side map or a re-derivation in `harness/` is an API gap. Stop, report, ask.
16. **Rename with `pk-rename-symbol`, then `pnpm typecheck`.**
17. **`pnpm verify:full` is the gate.** `pnpm verify:full > /tmp/v.log 2>&1; tail -3 /tmp/v.log`. Report the verdict line.
18. **Vendor Gantt names never appear here or in `src/`.** Scheduling vocabulary stays out of this work.
19. **Tick each box when you finish it, not at the end.**

---

## What the end state is

- **A bar is an Entry.** It has an authored `EntryId`, a `parentId`, dates, an optional `name`, declared values, a variant and capabilities — because every Entry has all of those already.
- **One new config key.** `EntriesRowSource.childrenAsSegments` takes `true`, a field match, or `(entry) => boolean`. It is the only new public surface this work adds.
- **A claimed parent gives its children no rows** and carries their Items on its own row. It is never expandable, in flat or tree mode.
- **A claimed parent draws no bar of its own**, so its rail does not paint over the children it stands for. A consumer variant may still paint one (C2 rules the seam).
- **The Selection holds Entries.** `SegmentId`, `selectedSegmentIds`, `Item.segmentId`, `FrameBar.segmentIds` and `view/segment-selection.ts` retire. A new ADR revises ADR 0010.
- **The Segment retires with no legacy.** `segments` leaves `EntryInput`, `StoredEntry` and `Entry`; `updateSegment`, `addSegment` and `removeSegments` leave `dataset.entries`; the four envelope paths and their four errors go. This library has never shipped to a user, so no migration path ships (CLAUDE.md).
- **`Entry.name` is optional.** A missing name prints nothing, and the bar still draws.
- **A bar names the Field it prints.** `barLabels: { field, placement }`, Gantt-wide and per variant, through that Field's `formatValue`.
- **The Rollup stops re-deriving an index the store already holds.** `committedChildIds()` is published, `RollUpTree` carries it, and a commit that moves no row skips the hierarchy re-check.

---

## The API, in call sites

Publish the invocation an author writes. Read each line aloud before you change a name.

| Job | Call site | New? |
|---|---|---|
| Author a bar with data | `{ id: 'd1', parentId: 'req-1', start, end, hours: 8 }` | no |
| Draw every parent's children on its row | `rowSource: { source: 'entries', childrenAsSegments: true }` | **the one new key** |
| Draw one parent's children on its row | `rowSource: { source: 'entries', childrenAsSegments: { showDaysOnRow: true } }` | the same key |
| Claim by predicate | `rowSource: { source: 'entries', childrenAsSegments: (entry) => entry.read('ownRows') !== true }` | the same key |
| Open one row into sub-rows, live | `dataset.entries.update('req-1', { showDaysOnRow: false })` | no |
| Put a summary row above a claimed row | `rowSource: { source: 'entries', tree: true, childrenAsSegments: { showDaysOnRow: true } }` | the same key |
| Read a bar's value | `entry.read('hours')` | no |
| Name the row a bar sits on | `entry.parent()` | no |
| List a row's bars | the parent's children | no |
| Total bar values onto the row | `{ key: 'hours', type: 'number', rollUp: 'sum' }` | no |
| Patch one bar | `dataset.entries.update('d2', { hours: 6 })` | no |
| Add one bar | `dataset.entries.add({ parentId: 'req-1', start, end, hours: 8 })` | no |
| Remove a bar | `dataset.entries.remove('d1')` | no. Several bars are several calls in one `transaction` |
| Move a bar to another row | `dataset.entries.update('d1', { parentId: 'req-2' })` | no (the write). The vertical **drag** does not reach it — see *Out of scope* |
| Match a bar | `{ name: 'fullDay', when: { hours: 8 }, css }` | no |
| Gate a gesture per bar | `capabilities: { resize: (entry) => entry.read('locked') !== true }` | no |
| Print a Field on every bar | `barLabels: { field: 'hours', placement: 'inside' }` | the long form is new; the string shorthand stays |
| Print a Field on one variant's bars | `bar({ barLabels: { field: 'hours' } })` | `EntryVariant.barLabels` is new |
| Format a value | `formatValue: (value, ctx, entry) => …` | no |
| Paint a bar | `paint: ({ entry, item, label }) => …` | no. `BarRendererContext` loses nothing and gains nothing |
| Read the change | `{ store: 'entries', id: 'd2', field: 'hours', from: 4, to: 6 }` | no |
| Propose a cascade | an `EditExtender` returns `EntryEdits` | no |
| Show the same bars as sub-rows | change the rule, or the value it matches | no |
| Select a bar | `gantt.selectedEntryIds = ['d1']` | renamed from `selectedSegmentIds` |

**The name is ruled, 2026-09-17, by the author.** `childrenAsSegments` — read the call site aloud: "row source: entries, children as segments, where show-days-on-row is true." It says what the children *become*, and it discriminates, because an unclaimed parent's children draw a bar on a row of their own and never a segment of another row's bar. **`Row` is not in the name** because the key already sits on `rowSource`, and a name does not repeat its own context. Rejected: `childrenAsRowSegments` (that repetition), `childrenOnParentRow` (this plan's own placeholder — it says where, not what), `childrenAsBars` (an unclaimed parent's children draw bars too, so the word does not discriminate), `mergeChildRows` (names the mechanism, not the job), `splitRow` ("Split" is under *Avoid* in `CONTEXT.md`), `childrenOnRow` (does not say whose row).

**This is what frees the word *Segment*, and it costs one thing.** The `Segment` **type** retires in C6, and the word keeps one meaning with no type behind it: *a child Entry drawn as one piece of its parent's row*. Between C1 and C6 the word means two things at once — the retiring type and the new key. That is the fault class #7 named ("chart"), so it is not free, and it is bounded: C1 rewrites `CONTEXT.md`'s *Segment* entry on the day the key lands, naming the new meaning first and marking the type as retiring with its build number. A reader of one entry then sees one story with a date on it, instead of two live meanings.

---

## What the Segment costs today, and what retires

Measured at `d87cbdd` and re-checked at `496ed77`: **59 non-test sites and 37 test files** read `segments`.

| Area | What goes |
|---|---|
| model | `Segment`, `SegmentId`, `segmentId()`, `StoredEntry.segments`, `EntryInput.segments`, `Item.segmentId`, `FrameBar.segmentIds`, `FrameRow.segmentIds` |
| errors | `SegmentNotFoundError`, `EmptySegmentsError`, `SegmentsOutOfSyncError`, `DuplicateSegmentIdError` |
| data | `updateSegment`, `addSegment`, `removeSegments`, `entryIdOfSegment`, `entryIdsOfSegments`, `segmentIdsOfEntries`, `segmentIdsDroppedBy`, the positional id match, `#removeSegmentsFrom`, `toSegment`/`toSegments`, `reconcileEnvelope`, `reconcileExtenderEdits`' envelope clause |
| rollup | `widenSegmentsToEnvelope`, `fitSegmentsToEnvelope`, and the clamp-then-widen block at `data/rollup.ts:139-159` — **the single best argument for this design: it exists only because a rolling-up parent may also own Segments, and a child Entry can never be both** |
| time | `envelopeOfSegments` (`time/instant.ts:56-68`) |
| layout | `followSegments`/`ignoreSegments` (`items/item.ts:180`), `segmentIdsByItem`/`segmentIdsOfEntries` (`frame-memory.ts:96-130`), `segmentIdsForItem` (`frame-layout.ts:142`), the `segments` branch of `gesture-draft.ts:112-125,264` |
| view | `view/segment-selection.ts` as a module, `selectedSegmentIds`, `selectableSegmentsInRowOrder`, `reveal`'s dual resolution |
| render | the `data-segment-id` stamps |
| api/fields | `measureDuration: 'segments'` (`fields/field-access.ts:220`), the `segmented-entry` cell-editor reason |
| docs | ADR 0010's unit, ADR 0012's "at least one Segment iff it spans", `plans/01` §§2.2/8, `plans/02` §§ on `segments`/`removeSegments`/`selectedSegmentIds`, `CONTEXT.md`'s *Segment* entry |

**`measureDuration: 'segments'` becomes `measureDuration: 'children'`** (Q25, ruled by the author 2026-09-17). A row's worked duration is the sum of its children's spans, not its own envelope. **Overlap has no rule of its own: core adds the children, and never reads them for overlap** — whatever the Aggregator says. A consumer who wants an overlapped hour counted once registers their own Aggregator and names it.

---

## Invariants this work touches

| Invariant | Where it bites | How the build proves it |
|---|---|---|
| **I2** no module state | the claim rule runs per Gantt | two Gantts on one Dataset, one claiming and one not, in one test (spike Q7 proved it in probe code) |
| **I5** hot path allocates nothing | the claim pass, per-Entry capability resolution | the claim runs in the layout pass; `applyState` perf test unchanged. **A browser measurement is still owed** — the spike's hover number is a Node proxy |
| **I8** `Item.id` deterministic | every bar's Item id becomes `itemId(entryId, 0)` — an authored id, stable across sessions | layout snapshot test gains a claimed row |
| **I14** one resolution for chrome and gesture | handles per bar on a shared row | `e2e/write-refusal.spec.ts` gains a locked child beside a free one |

---

## Build order

Each build lands as one change with `verify:full PASS`. Change the order only with a stated reason.

**Before C6, the word *segment* names two things in `src/**`, and only one of them is this work.** Every `Segment` type, `segmentId`, `segmentIds`, `selectedSegmentIds`, `data-segment-id` and `view/segment-selection.ts` symbol is the **retiring type**. None of them is the `childrenAsSegments` key. Builds C1–C5 read them as the type and leave them alone. C6 deletes them.

```
C1  →  C2  →  C3  →  C4  →  C5  →  C6  →  C7
```

| Build | Job | Lands after | Gate |
|---|---|---|---|
| **C1** The rule | `childrenAsSegments` on `EntriesRowSource` and `ResolvedEntriesRowSource`; the fold in `resolveEntriesSource` in **both** branches; `entryTreeIndex` in the flat branch; `expandable` cleared on a claimed parent; the claimed marker on `PlannedRow` (Q19 shape (a)); an early return so an unset rule costs nothing. **Plus, both ruled by the author:** a `boolean` Field type (Q22), and `fieldContext` threaded into the entries-source pass so the match uses each Field's own `equals` and an unknown key reports through `reportUnknownFieldMatch` (Q21). `CONTEXT.md`'s *Segment* entry is rewritten in this build, not in C7 | — | rows for the two-level and three-level fixtures; `nestsRows` still reads `tree` alone; a claimed flat source stays a `grid`; the live switch through `gantt.rowSource`; two Gantts disagree (I2); the unset-rule path measures as it does today; `childrenAsSegments: true` on a three-level tree gives rows to the roots alone (J-plan-I); `{ key: 'showDaysOnRow', type: 'boolean' }` ingests, formats, sorts and compares; a misspelt key in the rule reports once and claims nothing; a filter that drops a claimed parent drops its segments with it (J-plan-F); **an unclaimed parent is unchanged** — a Gantt with no rule, and a Gantt whose rule this parent does not match, both produce the row list they produce today, and no existing row snapshot moves |
| **C2** The claimed parent's own bar | `produceItemsForRow` skips the row's subject when the row claims, and `ItemProducer` takes one more parameter — `childrenAsSegments`, per Entry, `row.claimed && entry.id === row.entryIds[0]` (Q27). `ignoreSegments` returns `[]` when it is `true`, so core's own `summary()` paints no rail over the bars it stands for. **Core ships no rail otherwise**: no key, no concept, no helper | C1 | a claimed row draws exactly its children's bars and nothing else, `summary()` resolved for the parent included; a consumer producer still draws a band behind them; an empty claimed parent draws a blank row; **an unclaimed parent still wears `summary()`'s rail over its children's own rows, in the same Gantt, in the same frame** |
| **C3** A shared row resolves per Entry | audit and fix the nine `entryIds[0]` sites (seven read a row's list, two read the Selection's); capabilities, resize handles, hover, keyboard order, `reveal`, a11y labels and the grid-row click answer per Item, not per subject | C2 | a locked child refuses resize while its sibling keeps both handles (I14); keyboard order walks the bars in draw order; a grid-row click selects every bar the row owns; `reveal` finds a child bar |
| **C4** The Rollup fast path | publish `EntryStore.committedChildIds()`; carry it on `RollUpTree`; skip `checkHierarchyAnswers` and both index builds when a commit moves no row | C1 | the spike's bench as a real test; a commit that **does** move a row still re-checks; no behaviour change in any existing test |
| **C5** Name and label | `Entry.name` optional on `EntryInput`/`StoredEntry`/`Entry`; `BarLabels` long form `{ field, placement }`; `EntryVariant.barLabels` merging key by key over the Gantt's; the label read from the Entry's Field through `formatValue` | C3 | the empty-label geometry test; the day/week/year zoom test; a bar with no name draws and prints nothing; the grid's name cell is empty |
| **C6** The Segment retires; the Selection holds Entries | the two ADRs first, then the deletions in the table above; `selectedSegmentIds` → `selectedEntryIds`; `view/segment-selection.ts` → `view/entry-selection.ts`; `measureDuration: 'segments'` → `'children'` and `measureEntryDuration` reads `storedChildrenOf` in place of `entry.segments` (Q25); `ignoreSegments` → `wholeSpan` and `followSegments` deleted (Q26); **the `Item` → `Bar` rename if Q28 is ruled** — C6 is the one rename build, and `itemId`'s second parameter is already on its list; `itemId(entry, segmentIndex = 0)` (`model/ids.ts:39`) loses the word `segment` from its second parameter and from its doc comment | C5 | every deleted door has no caller; `pnpm verify:full PASS`; the 37 Segment test files are deleted or rewritten against Entries; no `segments` key remains in `src/**` |
| **C7** Harness, glossary, docs | one crew-lead row of day bars with per-bar text, colour, capabilities and a row total; a toggle that opens it into sub-rows; a plain bar with no name; `CONTEXT.md`; `docs/08` promoted from proposal to shipped; `docs/05-consumer-api.md`; `plans/01`, `plans/02`, `plans/03` updated; close #421 | C6 | `harness/main.ts` reviewed against the stop rule; every acceptance box in #421 ticked |

**Why this order.** C1 before C2: nothing can suppress a parent's bar until a row claims one. C3 before C5: a label resolved per bar needs per-Entry resolution first. C4 stands alone and may land any time after C1 — it is the measured half of the cost. C6 last of the code builds: the Segment must not retire while any build still needs a shipped comparison.

**What C6 will break.** Expect wide test breakage, the same shape the spike measured on a narrower change. Do it after an ADR, not before.

---

## Decisions this plan makes

Reversible. Each is a **J** in the log when a build takes it.

- **J-plan-A.** The claim is a rule on `EntriesRowSource`, evaluated per parent Entry in the layout pass. It takes `true`, a `FieldMatch`, or a predicate — the `when` pattern, one match syntax.
- **J-plan-B.** Q19 **shape (a)**: `entryIds[0]` stays the row's subject, and `PlannedRow` carries a marker that says the row claims its children. Shape (b) was written and it breaks nine call sites with no compile error (`SPIKE-FINDINGS.md`).
- **J-plan-C.** A claimed parent is never expandable, in flat or in tree mode. The consumer opens it by writing the Field the rule matches.
- **J-plan-D.** An empty claimed parent keeps its row and draws nothing. A blank row is what a dateless row already draws.
- **J-plan-E.** Overlapping bars on one row draw at the shared band, and the later id in `row.entryIds` paints on top — the children's dataset order, not date order. `hitTest` already answers the topmost element, so no new code. Lane packing stays retired (#298).
- **J-plan-F.** **A filter hides a parent, and its segments go with it** (Q20, ruled by the author 2026-09-17). `applyFilter` keeps or drops whole rows and tests the row's subject — the claimed parent — so a claimed parent's segments are hidden by the same act that hides their row. Nothing else is needed, and no item-level knob ships. **The consequence to state in the docs:** a filter predicate on a claimed row is never asked about a child, so a filter cannot keep some of a row's segments and drop others. Hiding the parent is the whole answer.
- **J-plan-G.** The Segment retires with no migration path and no legacy key. This library has never shipped to a user.
- **J-plan-H.** A bar's Item id is `itemId(entryId, 0)` — an authored id, stable across sessions.
- **J-plan-I.** **A claim is a collapse, one level deeper.** A claimed parent draws its **direct** children as bars, and the whole subtree below the claimed parent loses its rows. A direct child that has children of its own draws one bar whose span rolls up over them, exactly as a collapsed parent's bar does today (`layout/rows/collapse.ts:18-20`). So `childrenAsSegments: true` on a three-level tree gives rows to the roots alone. No new mechanism, and no case where an Entry's row disappears without a bar standing for it.

---

## User stories

Each story is one acceptance test. The consumer brief is `plans/handoff/2026-09-15-crm-filament-labor.md` §3.

1. **A crew lead sees one bar per day.** A labour request's days are child Entries with `hours`, `worker` and `filled`. The rule claims the request, so the row shows one bar per day, each with its own text and colour. A weekend gap draws nothing, because no child covers it.
2. **The row shows the total.** `hours` declares `rollUp: 'sum'`. The request row's grid cell reads the sum of its days, at every zoom.
3. **A filled day looks different from an open one.** `{ name: 'filled', when: { filled: true }, css }`. The ordinary variant rule claims exactly the filled bars.
4. **A locked day cannot be resized, its neighbours can.** `capabilities: { resize: (entry) => entry.read('locked') !== true }`. The locked bar shows no handle. The bar beside it shows both.
5. **A dispatcher assigns one worker to ten days in one step.** Ten `dataset.entries.update(id, { worker: 'Ali' })` calls inside one `transaction`. One ChangeSet, ten rows, one undo.
6. **A booking with no title is still a bar.** `{ id: 'hold', start, end }`. The grid's name cell is empty. The bar draws, hovers, selects and resizes like any other. A screen reader hears the dates.
7. **A bar prints hours, not its name.** `bar({ barLabels: { field: 'hours' } })`. The bar reads `8 h` through the Field's `formatValue`, the same text the grid shows.
8. **A lead adds a day to a request.** `dataset.entries.add({ parentId: 'req-1', start, end, hours: 8 })`. One new bar appears, the other bars keep their ids, the row total grows by 8, and undo reverses all of it.
9. **A drag keeps the data.** The lead drags a day one column right. Its `worker`, `hours` and `filled` are unchanged. Undo moves it back with the Selection intact.
10. **A request moves as a whole.** The lead drags the request row. Every day moves. `entries.update('req-1', { start })` is refused with `DerivedFieldNotWritableError`, because the row's dates roll up (ADR 0013).
11. **The same days open into editable rows.** `dataset.entries.update('req-1', { showDaysOnRow: false })` — one write, one undo step. The days become sub-rows with editable grid cells, every other row unchanged, and undo restores the claimed shape with the Selection intact.
12. **A site summarises two crews.** Three levels, `tree: true`: `site-a` keeps its rail and its chevron, `req-1` and `req-2` each carry their days, and `site-a`'s `hours` totals every day under both crews.
13. **Two Gantts disagree.** One Gantt claims the requests and draws day bars. A second Gantt on the same Dataset shows the days as rows. Neither changes the data (I2).
14. **A day moves to another crew.** `dataset.entries.update('d1', { parentId: 'req-2' })`. The bar keeps its id, its data and its place in the Selection. Both row totals change in one undo step.

---

## Files a build touches most

| Area | Files |
|---|---|
| layout (C1, C2, C3) | `layout/rows/entries-source.ts`, `layout/rows/row-source.ts`, `layout/rows/resolve-rows.ts`, `layout/rows/collapse.ts`, `layout/rows/filter.ts`, `layout/rows/sort.ts`, `layout/items/produce-items.ts`, `layout/items/item.ts`, `layout/frame.ts`, `layout/frame-memory.ts`, `layout/frame-layout.ts` |
| data (C4, C6) | `data/entry-store.ts`, `data/rollup.ts`, `data/entry-reader.ts`, `data/live-entry.ts`, `data/change-set.ts`, `data/build-commit-change-set.ts`, `data/transaction.ts`, `data/fields/field-access.ts` |
| model (C5, C6) | `model/stored-entry.ts`, `model/entry.ts`, `model/errors.ts`, `model/ids.ts`, `model/dataset.ts` |
| time (C6) | `time/instant.ts` (`envelopeOfSegments` retires) |
| view (C3, C6) | `view/gantt-shell.ts`, `view/segment-selection.ts` (renamed), `view/capability.ts`, `view/affordance-projection.ts`, `view/roving-focus.ts` |
| render (C3, C5, C6) | `render/dom/index.ts` (label, handle, paint lookup, the `data-*` stamps) |
| api (C1, C6) | `api/gantt.ts` (`rowSource`, `selectedEntryIds`), `api/index.ts` (the retired exports) |
| consumer (C7) | `harness/main.ts`, `fixtures/demo-dataset.ts`, `fixtures/planner-dataset.ts`, `CONTEXT.md`, `docs/05-consumer-api.md`, `docs/07-row-source-updates.md`, `docs/08-a-bar-is-an-entry.md`, `e2e/selection.spec.ts`, `e2e/write-refusal.spec.ts` |

---

## Out of scope

Each is real work this design makes possible. None of it ships inside #421.

- **A vertical drag that moves a bar to another row — #425.** The *write* ships today (`update('d1', { parentId: 'req-2' })`). The gesture does not: `interaction/entry-gestures.ts:300` drives hover visuals only, and nothing in `interaction/` reads the hovered row at commit. What is missing is a row-target step in the commit path, plus a ruling on whether it is default behaviour or a capability.
- **Mixed children** — one row carrying bars of its own *and* child rows below. The rule matches the parent, so it takes all of that parent's children. The brief has no such case.
- **A claimed parent's child that has children of its own.** Ruled by C1 — see J-plan-I. It is not out of scope; it is settled, and it needed no new mechanism.
- **A subtree copy.** `toInput()` copies one Entry. A hierarchy needs that door with or without this design.
- **A row that paints one value per tick:** #423.
- **Stacked bars** — two bars that cover the same time on one row, with the pointer hitting only the top one: #215. J-plan-E states what happens today.
- **Links to a split piece of work.** The scheduling plugin rules it, not this work (S7).
