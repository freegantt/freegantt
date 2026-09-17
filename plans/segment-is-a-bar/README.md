# A Segment is a bar — the build plan for #421

[#421](https://github.com/Pawel-IT/FreeGantt/issues/421) is the spec. **This plan does not restate it.** Read the issue once, then this file, then work one build. Open questions and lone calls go in [`BUILD-LOG.md`](BUILD-LOG.md).

Opened 2026-09-16 at `d87cbdd`. Every line number below was measured there. **A line number is a hint. Open the file.**

**Rewritten 2026-09-17 to Option C** (Q6, Q9, Q10). Every bar is one Segment, with one id and one live type. There are no two doors for one job. Q11 lists the Option C details that are still open. A build that reaches one stops and asks.

---

## Hard rules

1. **The issue decides. This plan orders.** When the two disagree, the issue wins, and you log a **Q**.
2. **No stored classification.** Nothing on a public type says "hidden", "authored", "plain" or names a variant. `plans/01` §2.5, ADR 0013, ADR 0018.
3. **A `read(key)` never falls through** (Q7). `segment.read('hours')` answers that Segment's own value, or nothing. **Navigation is not a read:** `segment.entry()` names the row, and `entry.segments` lists its Segments. **A derived cell is a write, not a read:** the Rollup writes the row's own cell, and the row reads that cell.
4. **Every bar is a Segment** (Q6, Q10). A plain row answers one Segment. A segmented row answers one per authored Segment. A seam that is about a bar takes one `Segment`, never `(entry, segment?)`.
5. **Segments and children are not special to the Rollup** (Q8, Q9). A row's cell rolls up over its Segments and its children, unioned, through the normal Aggregators. `start`/`end` are core Fields with `rollUp: 'min'`/`'max'`, like any consumer `rollUp`. No code path checks for `start`/`end`, or for a Segment-vs-child input. A special case for either is a bug.
6. **A segmented row obeys the rolling-up parent's rules** (Q10, ADR 0013). A write to its `start`/`end` is refused (`DerivedFieldNotWritableError`) unless the Field declares `distribute`. A drag on the row moves its Segments and never writes the row.
7. **Text never decides whether a bar shows.** An empty label leaves geometry, fill, hit target, hover, selection and handles unchanged. One test pins this.
8. **Zoom never touches a Segment.** No folding, no read of the visible range. An Aggregator never writes onto a bar. A test pins the same printed value at day, week and year zoom.
9. **One key, one meaning.** One `fields` list. `Field.column` and `distribute` are Entry-only. A key with no `rollUp` shows an empty grid cell, as it does over children today.
10. **Every write is one transaction, one ChangeSet.** A Segment value write is one `store: 'segments'` row. A whole-array `segments` diff does not meet the issue for a value write.
11. **The hot path allocates nothing (I5).** A live `Segment` has one identity per id for the life of the store, as `LiveEntries` does. The bar-phase variant walk runs in the layout pass, never per pointer move.
12. **All date arithmetic goes through `time/`.** A Segment moves and resizes through the bound `TimeScale`.
13. **The harness never patches the library.** A cast, a side map or a re-derivation in `harness/` is an API gap. Stop, report, ask.
14. **Rename with `pk-rename-symbol`, then `pnpm typecheck`.** B1 has one rename whose meaning inverts while typecheck stays green. Its build says so.
15. **`pnpm verify:full` is the gate.** `pnpm verify:full > /tmp/v.log 2>&1; tail -3 /tmp/v.log`. Report the verdict line.
16. **Vendor Gantt names never appear here or in `src/`.** Scheduling vocabulary stays out of this work.
17. **Tick each box when you finish it, not at the end.**

---

## What the end state is

- **Every bar is a Segment.** A live `Segment` answers `id`, `start`, `end`, `name?`, `read(key)`, `entry()` and `toInput()`. It is a stored/live pair like `Entry` (ADR 0017).
- **Two collections, one per concept** (Q10). `dataset.entries` holds rows: grid, hierarchy, row cells. `dataset.segments` holds bars: `get`, `add`, `update`, `remove`. `updateSegment`, `addSegment`, `removeSegments` and `whenSegment` do not ship.
- **An authored Segment** stores `id`, `start`, `end`, `name?` and `props` inside its Entry's `segments` array.
- **A plain row's Segment is backed by the Entry** (Q10). A plain spanning Entry stores `segments: []`. `entry.segments` answers one live Segment. Its id is minted in a store index, never stored. It reads and writes the Entry's own record, so `dataset.segments.update(plainId, { hours: 8 })` lands as a `store: 'entries'` row on the Entry. This is backing, not a fallthrough: the plain Segment has no values of its own.
- **An Entry's dates have one source at a time** (Q1, Q2, Q4, Q9). A row with no authored Segments keeps the dates it named (ADR 0012). A row with authored Segments rolls `start`/`end` up from them with `min`/`max`. Clearing the Segments clears the dates. A caller that wants a plain bar names the dates in the same edit: `entries.update(id, { segments: [], start, end })`. `envelopeOfSegments`, `reconcileEnvelope`, `fitSegmentsToEnvelope` and `widenSegmentsToEnvelope` retire into the Rollup.
- **A row's cell may roll up its Segments** (Q8). One input: Segments and children, unioned. No precedence, no source knob. `distribute` onto Segments is not ruled.
- **`name` is optional** on `EntryInput`, `StoredEntry`, `Entry`, `SegmentInput`, `StoredSegment`, `Segment`.
- **A variant resolves in two phases, from two rule lists** (Q6). The row list decides `items`. The bar list decides `paint`, `css`, `can` and `barLabels`, one Segment at a time. The two list names are open (Q11).
- **`can` and the resize handles resolve per Segment.** Chrome and gesture read one answer (I14).
- **A bar prints one Field** from its Segment, through that Field's `formatValue`. Default `name`.
- **The ChangeSet names a Segment by its own id.** A value write is `{ store: 'segments', id, field, from, to }`. There is no `segmentId` key.

---

## The API, in call sites

Publish the invocation an author writes. Read each line aloud before you change a name. A row marked **Q11** has an open detail; build it only after Q11 answers.

| Job | Call site | New or changed |
|---|---|---|
| Author a Segment with data | `{ id: 'd1', start, end, hours: 8, color: 'red' }` inside `segments` | `SegmentInput` gains `name?` and flat declared keys; nested `props` also legal |
| Read a bar's value | `segment.read('hours')` | live `Segment.read(key)`. A plain row's Segment reads the Entry's record |
| Name the row a bar sits on | `segment.entry().name` | new; navigation (Q7) |
| List a row's bars | `entry.segments` | never empty for a spanning row; a plain row answers one |
| Total bar values onto the row | `{ key: 'hours', type: 'number', rollUp: 'sum' }` | `rollUp` reads Segments and children, unioned (Q8) |
| Write one bar | `dataset.segments.update('d2', { color: 'grey' })` | new collection |
| Add one bar | `dataset.segments.add('req-1', { start, end, hours: 8 })` | returns the live `Segment`. On a plain row the minted id drops, and the row starts rolling up its dates |
| Remove bars | `dataset.segments.remove(['d1', 'd2'])` | replaces `entries.removeSegments`. A plain row's id un-dates the row |
| Write many bars, one undo | `dataset.transaction(() => { for (const id of ids) dataset.segments.update(id, { worker: 'Ali' }); })` | no change to `transaction()` |
| Reorder or replace a row's bars | `dataset.entries.update('req-1', { segments: [...] })` | unchanged; the structural door (J-plan-3) |
| Move a segmented row | drag the row, or `moveEntryTo` | moves every Segment; the row's own `start`/`end` are not written (ADR 0013) |
| Write a segmented row's dates | `dataset.entries.update('req-1', { start })` | refused, `DerivedFieldNotWritableError`, like a rolling-up parent |
| Copy an Entry | `dataset.entries.add({ ...entry.toInput(), id: 'copy' })` | `toInput()` emits authored Segments with `name`/`props` and no ids; no `segments` key for a plain row |
| Match a bar by value | a bar-list rule `{ name: 'fullDay', when: { hours: 8 }, css }` | `FieldMatch` reads the Segment. **Q11:** list name |
| Match a bar by predicate | a bar-list rule `{ when: (segment) => (segment.read('hours') ?? 0) > 8 }` | one argument. **Q11:** list name |
| Gate a gesture per bar | `interactions: { resize: (segment) => segment.read('locked') !== true }` | `CapabilityRule` takes the `Segment` |
| Gate a write | `interactions: { edit: … }` | **Q11:** one signature for a grid cell and a bar |
| Print a Field on every bar | `new Gantt({ barLabels: { field: 'hours', placement: 'inside' } })` | `BarLabels` gains the long form; the string shorthand stays |
| Print a Field on one rule's bars | `bar({ barLabels: { field: 'hours' } })` | overrides `field`, `placement` or both (J-plan-5) |
| Paint a bar | `paint: ({ segment, item, label }) => …` | `BarRendererContext.segment`, required. **Q11:** an Item that draws no single Segment |
| Format a value on a bar | `formatValue(value, ctx, …)` | **Q11:** one signature for a grid cell and a bar |
| Read the change | `{ store: 'segments', id: 'd2', field: 'color', from: 'red', to: 'grey' }` | `store` gains `'segments'` |
| Propose a cascade | `EditExtender` | **Q11:** return shape with two collections |

**Names that stay off the app-author surface:** `StoredSegment` (plugin surface: ChangeSet entity, `EditRequest`) and `resolveForSegment` (internal). The minted id is an ordinary `SegmentId`; nothing marks it as minted.

---

## The plain bar — how core knows a Segment is not authored

**Answer: there is no hidden Segment record. There is a minted id, and the Entry backs it.**

- `StoredEntry.segments` holds authored Segments only. A plain spanning Entry stores `segments: []`, and `toInput()` emits no `segments` with no filter and no flag.
- The store keeps **one minted `SegmentId` per plain spanning Entry** in an index (`data/entry-store.ts`, beside `#entryIdBySegmentId` at `:523`). Core mints it when an Entry becomes plain and spanning. Core drops it when the Entry stops spanning or gains authored Segments. It is not data: no `StoredEntry` field, no ChangeSet row, no `toInput()` key (J-plan-1).
- **The live plain Segment is backed by the Entry.** `read`, `start`, `end` and `name` answer the Entry's own values. A write through `dataset.segments` lands as `store: 'entries'` rows on the Entry. So the minted id never reaches a ChangeSet row.
- `entryIdOfSegment`, `entryIdsOfSegments` and `segmentIdsOfEntries` answer the minted id (`entry-store.ts:493`). Selection, `segments.remove`, keyboard select, grid-row click and `reveal` (`gantt-shell.ts:2101`) keep working.
- **`segments.add` on a plain row makes it authored.** The minted id drops, and the new Segment's id names the bar. The row starts rolling up `start`/`end`, and its authored dates drop — ADR 0013's rule for an Entry that starts rolling up. The Selection follows J-plan-2.
- **Stable across a date edit and an undo.** A drag on a plain bar writes the Entry's `start`/`end`, never `segments`. S3 measured this.
- **`layout/` may keep reading `entry.segments`.** A live plain row now answers its minted Segment there, so the `LayoutInput` port the first plan needed may be unnecessary. B2 checks whether `frame-memory.ts:127,157` read the live or the stored Entry, and logs a **J**.

**Every site that reads `segments`, and what it does after B2 and B3** (measured at `d87cbdd`; 59 non-test sites, 37 test files):

| Site | Today | After |
|---|---|---|
| `data/entry-reader.ts:122-132` `toSegments` | fills one Segment for a spanning Entry | stored: `[]` when none authored. Live: the plain Segment |
| `data/entry-reader.ts:316-360` `reconcileEnvelope` | a sole Segment mirrors a `start`/`end` write | **retires (Q9).** The Rollup writes a segmented row's dates. A consumer write to them is refused (Q10) |
| `data/entry-reader.ts:101` `toSegment` | builds `{ id, start, end }` | keeps `name` and `props` from `existing` when the input names neither |
| `data/entry-reader.ts:444` `moveEntryTo` | returns a `segments` write | plain → `{ start, end }`; segmented → each Segment moves, data kept, the row is not written (J-plan-4) |
| `data/rollup.ts:180-186` | mints a Segment for a derived parent, pushes a `segments` row | writes `start`/`end` only; the store mints the plain id on apply |
| `data/rollup.ts:164-197` `widenSegmentsToEnvelope`, `fitSegmentsToEnvelope` | fit Segments to a new envelope | **retire (Q9).** The Rollup reads Segments as input and never writes them |
| `time/instant.ts:56-68` `envelopeOfSegments` | min/max over spans | **retires (Q9)** into the `min`/`max` Aggregators |
| `data/entry-store.ts:720` `#removeSegmentsFrom` | removes by id, un-dates on last | backs `segments.remove`. The minted id un-dates the row. The last authored Segment un-dates it too (Q2) |
| `data/change-set.ts:128` `segmentIdsDroppedBy` | diffs `segments` rows | deleted. The Selection drops an id when `entryIdOfSegment(id)` is `undefined` after a commit |
| `data/live-entry.ts:163` `toInput` | emits `segments` with ids | authored only, `name` + `props`, no ids |
| `data/fields/field-access.ts:220` `measureDuration: 'segments'` | sums Segments | sums the live Segments; a plain row answers its span |
| `layout/gesture-draft.ts:112-125,264` | rewrites `segments` | plain → `start`/`end` draft; authored → `segments` draft, data kept |
| `layout/items/item.ts:180` `followSegments` | one Item per Segment, else whole span | one Item per live Segment; a plain Item carries the minted id |
| `layout/frame-memory.ts:127,157` | reads `entry.segments` | see the last bullet above |
| `extensions/features/inline-editing.ts:89` | `segments.length <= 1` | unchanged in meaning |
| `view/gantt-shell.ts:2103` `reveal` | finds the Segment on the owner | unchanged; the minted id resolves like any id |
| `layout/entry-double.ts` (test-only) | builds an `Entry` | also builds live `Segment`s |

---

## Invariants this work touches

| Invariant | Where it bites | How the build proves it |
|---|---|---|
| **I2** no module state | live `Segment` cache, variant resolution | cache lives on the store; the two-Gantt isolation test gains a bar rule |
| **I5** hot path allocates nothing | bar-phase walk, `segment.read()` on hover | walk runs in the layout pass and the frame carries the winner; `applyState` perf test unchanged |
| **I8** `Item.id` deterministic | plain bar keeps index 0; authored Segments keep array index | layout snapshot test gains a segmented row |
| **I14** one resolution for chrome and gesture | handles per Segment, `canGesture(item)` | `e2e/write-refusal.spec.ts` gains a locked Segment beside a free one |

---

## The stored/live migration for `Segment`

Mirror ADR 0017 exactly. Do not invent a third shape.

1. `pk-rename-symbol` today's `Segment` → `StoredSegment`. **Typecheck stays green while the meaning inverts.** Then add `name?: string` and `props: Readonly<Partial<TProps>>`.
2. Declare the new live `Segment` in `model/segment.ts`: `id`, `start`, `end`, `name?`, `read(key)`, `entry()`, `toInput()`. No `props` on the read surface, the same rule the row follows.
3. Build it in `data/live-segment.ts` beside `LiveEntries`: one instance per `SegmentId`, identity stable for the store's life, reads through the store so an open transaction overlays it. A plain row's instance reads the Entry's record.
4. `StoredEntry.segments: readonly StoredSegment[]`. `Entry.segments: readonly Segment[]`.
5. **A bar seam takes `Segment`:** bar-list rules, `CapabilityRule`, `BarRendererContext`. **The edit pipeline carries `StoredSegment`:** `ProposedEdit.segments`, `EditRequest`, ChangeSet rows, `toSegment`. `WriteRule` and `formatValue` wait for Q11.
6. `SegmentInput` gains `name?` and props, read by the same `readProps` path `EntryInput` uses. Same warnings, same `DuplicatePropsKeyError`.

---

## Spikes — run 2026-09-16, all three answered

**Read [`SPIKE-FINDINGS.md`](SPIKE-FINDINGS.md) once before B1.** The rulings are J1, J2 and J3 in the log. The measurements stand. Where a spike recommended a two-door shape, Q6 replaced the shape and kept the measurement.

| Spike | Answer | Lands in |
|---|---|---|
| **S1** ChangeSet address | Today no row can name one Segment. A second apply path is small: one diff that reads `segment.read(field)`, one apply branch. `invertChangeSet` needs no change, so undo by id falls out. Under C the branch keys on `store: 'segments'`, not on a `segmentId` key | B4 |
| **S2** handle pair | **Rule B already ships.** `projectAffordances` brackets the row and gates each edge. The gap is that `Capabilities.can` takes no Segment, and hover does not thread the hovered Item into edge resolution | B6 |
| **S3** plain bar's id | The minted id is **stable across drag and undo with no ChangeSet row**. `removeSegments` un-dates with no code change | B2 |

---

## Build order

Each build lands as one change with `verify:full PASS`. Change the order only with a stated reason.

```
B1  →  B2  →  B3  →  B4  →  B5  →  B6  →  B7  →  B8
```

| Build | Job | Lands after | Gate |
|---|---|---|---|
| **B1** Segment data | `StoredSegment`/`Segment` pair, `entry()`, `name?` everywhere, Segment props at ingest, `toSegment` keeps data, `toInput()` copies | — | ingest tests; copy test creates new Segment ids; grid shows empty name cell |
| **B2** The plain bar | `segments: []` stored for plain, minted id in the index, live plain Segment backed by the Entry, Rollup writes a parent's dates without minting, draft, Selection drop rule, `layout/` read check. **`EmptySegmentsError` retires (Q1).** | B1 | S3's assertions as real tests; a plain Segment's `read` answers the Entry's value; every `segments` reader in the table re-read once |
| **B3** The Rollup reads Segments | Rollup input is children ∪ Segments; the four envelope paths retire; a `start`/`end` write on a segmented row refuses; a row drag and `moveEntryTo` move each Segment | B2 | `rollUp: 'sum'` totals day `hours` onto the row; Segments + child union test; `start`/`end` go through the same code as children (no key check); row-date write throws `DerivedFieldNotWritableError` |
| **B4** The `segments` collection | `dataset.segments.get/add/update/remove`, `store: 'segments'` rows, per-Segment apply/replay/undo, plain writes land as `store: 'entries'` rows, `removeSegments` retires, `EditExtender` shape (Q11) | B3 | S1's assertions as real tests; `add` refuses a duplicate id like `entries.add`; ten updates in one transaction are one undo |
| **B5** Variants per bar | row list and bar list (Q11 names), bar rules take one `Segment`, frame carries the winner per bar, `resolveBarRenderer(item)`, `BarRendererContext.segment`, `DoubleVariantClaim` names the Segment, `UnknownFieldMatch` for bar rules | B4 | every shipped rule claims the same Items as before (snapshot); `when: { hours: 8 }` in the bar list claims exactly those bars |
| **B6** Capabilities per bar | `CapabilityRule(segment)`, `can()` takes the Segment, `canGesture(item)` at every caller, handles per Segment (S2's rule), grid-row click selects only bars that allow select, `WriteRule` (Q11) | B5 | `e2e/write-refusal.spec.ts` locked Segment; a11y and keyboard paths ask the same `can` |
| **B7** Labels | `BarLabels` long form, per-rule `barLabels`, label resolved in layout from the Segment through `formatValue` (Q11), a11y label from printed text or dates, empty-label geometry test, day/week/year zoom test | B5 | the two pinned tests; a plain bar still prints `entry.name` |
| **B8** Harness, glossary, docs | one segmented row with per-bar text, colour, capabilities and a row total; one plain bar with no name; `CONTEXT.md` Segment/Item entries; the ADR that revises ADR 0012 (Q1) and ADR 0013 (Q9); `docs/` consumer page; close #421 | B6, B7 | `harness/main.ts` reviewed; acceptance list in #421 all ticked |

**Why this order.** B2 before B3: the Rollup must not mint a Segment before it reads Segments. B3 before B4: a Segment write re-runs the Rollup, so the Rollup reads Segments first. B5 before B6: `can` per bar reads the bar-phase winner. B7 after B5: a per-rule label reads the same winner.

**What the spikes measured.** Read `SPIKE-FINDINGS.md` for the evidence.

- **B2.** The Rollup mints and stores its own `segments` array row at `data/rollup.ts:180-189`, on a path that never calls `toSegments`. Stop that mint. Expect wide test breakage: the `data/`-layer change **alone** broke 37 tests in 8 files, 20 of them in `api/gantt.test.ts`. Those are deep end-to-end paths over the readers the table names, not readers the table missed.
- **B4.** The apply path is two pieces: a segment-scoped diff beside `diffEdit` (`data/change-set.ts:53-73`) that reads `segment.read(field)`, and one branch in `#applyUpdatedRows` (`data/entry-store.ts:937-946`) keyed on `row.store === 'segments'`. `invertChangeSet` (`:150-156`) already swaps `from`/`to` per row, so undo and replay need nothing. The Rollup then writes the row's `start`/`end` rows in the same transaction.
- **B6.** S2 confirmed rule B ships already: `resolveResizableEntry` (`view/affordance-projection.ts:86-114`) brackets the row and `resolveEdges` (`:72-79`) asks the two edges independently. Two gaps remain. `Capabilities.can` (`view/capability.ts:34-36`) and `#canGesture` (`view/gantt-shell.ts:1838-1841`) take `(capability, entry, edge?)`. And hover does not thread the hovered Item in. Close both by resolving `start`/`end` from the row's first and last `ItemId` through `itemIdsForEntry`, and asking `can` for that Item's Segment.

**Wide mechanical changes.** B1's `name?` touches every `entry.name` read. Let `pnpm typecheck` list them. Do not add `?? ''` at a read site that should print nothing; add it only where a `string` is required by a DOM API.

---

## Decisions this plan makes

Reversible. Each is a **J** in the log when a build takes it.

- **J-plan-1.** The plain bar's id lives in a store index, never in a record or a ChangeSet row. A write through it lands on the Entry.
- **J-plan-2.** `segmentIdsDroppedBy` goes. The Selection keeps an id while the store resolves it.
- **J-plan-3.** `dataset.entries.update(id, { segments })` stays the structural door for reorder and replace, and writes one `segments` row. `dataset.segments.add`/`remove` write one added or removed row each. A value write is one `store: 'segments'` row.
- **J-plan-4.** `moveEntryTo` returns `{ start, end }` for a plain row. For a segmented row it moves each Segment and never writes the row, as a parent drag does (ADR 0013).
- **J-plan-5.** A rule's `barLabels` merges over the Gantt's key by key: `{ field }` alone keeps the Gantt's placement.
- **J-plan-6.** The live `Segment` exposes `read(key)`, `toInput()` and `entry()`, and no `props` (Q7).
- **J-plan-7.** Internal `Capabilities.can(capability, segment, edge?)` takes a required `Segment`. Every bar has one, so no caller passes `undefined`. Run the naming skill on the object alternative before B6 and log the choice.

---

## User stories

Each story is one acceptance test. The consumer brief is `plans/handoff/2026-09-15-crm-filament-labor.md` §3.

1. **A crew lead sees one bar per day.** A labour request spans two weeks. Each day is a Segment with `hours`, `worker` and `filled`. The row shows one bar per day, each with its own text and colour. A weekend gap draws nothing.
2. **The row shows the total.** `hours` declares `rollUp: 'sum'`. The request row's grid cell reads the sum of its days. It reads the same number at every zoom.
3. **A filled day looks different from an open one.** A bar-list rule `{ name: 'filled', when: { filled: true }, css }`. No renderer, no side map. The rule claims exactly the filled bars.
4. **A locked day cannot be resized, its neighbours can.** `interactions: { resize: (segment) => segment.read('locked') !== true }`. The locked bar shows no handle. The bar beside it shows both. Dragging the locked edge does nothing.
5. **A dispatcher assigns one worker to ten days in one step.** Ten `dataset.segments.update(id, { worker: 'Ali' })` calls inside one `transaction`. One ChangeSet, ten `store: 'segments'` rows. One undo clears all ten.
6. **A planner copies a request.** `dataset.entries.add({ ...entry.toInput(), id: 'copy' })`. The copy has every day's data and fresh Segment ids. Nothing throws.
7. **A booking with no title is still a bar.** `{ id: 'hold', start, end }`. The grid's name cell is empty. The bar draws, hovers, selects and resizes like any other. A screen reader hears the dates.
8. **The same rule reads a plain bar.** `resize: (segment) => segment.read('locked') !== true` on a plain row with `locked: true` refuses the resize. The plain Segment reads the Entry's record.
9. **A bar prints hours, not its name.** `bar({ barLabels: { field: 'hours' } })`. The bar reads `8 h` through the Field's `formatValue`, the same text the grid shows. At year zoom it is a sliver and still reads `8 h` on hover.
10. **A lead adds a day to a request.** `dataset.segments.add('req-1', { start, end, hours: 8 })`. One new bar appears. The other bars keep their ids, so the Selection is unchanged. The row total grows by 8. Undo removes the bar, its data and the total change.
11. **A drag keeps the data.** The lead drags a day one column right. The bar moves. Its `worker`, `hours` and `filled` are unchanged. Undo moves it back and the Selection still holds it.
12. **A request moves as a whole.** The lead drags the request row. Every day moves. `entries.update('req-1', { start })` is refused with `DerivedFieldNotWritableError`.

---

## Files a build touches most

| Area | Files |
|---|---|
| model | `model/stored-entry.ts`, `model/segment.ts` (new), `model/change-set.ts`, `model/interactions.ts`, `model/field.ts:230`, `model/dataset.ts:64-69` |
| data | `data/entry-reader.ts`, `data/entry-store.ts`, `data/rollup.ts`, `data/live-entry.ts`, `data/live-segment.ts` (new), `data/change-set.ts`, `data/replay.ts`, `data/dataset-state.ts:298`, `data/fields/core-fields.ts` |
| time | `time/instant.ts` (`envelopeOfSegments` retires) |
| layout | `layout/items/variants.ts:82-111,444-530`, `layout/items/item.ts:93-110,180`, `layout/items/produce-items.ts`, `layout/frame.ts:136-156,271,353`, `layout/frame-memory.ts:110-160`, `layout/gesture-draft.ts`, `layout/renderer.ts:29-36,94` |
| view | `view/gantt-shell.ts:716,875,900,929,1352,1838`, `view/affordance-projection.ts`, `view/capability.ts:36,216`, `view/segment-selection.ts:121-140` |
| render | `render/dom/index.ts:201-260` (label and handle paint) |
| consumer | `harness/main.ts`, `fixtures/demo-dataset.ts`, `CONTEXT.md:67-73,212-214`, `e2e/selection.spec.ts`, `e2e/write-refusal.spec.ts` |
