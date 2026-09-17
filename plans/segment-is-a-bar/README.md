# A Segment is a bar — the build plan for #421

[#421](https://github.com/Pawel-IT/FreeGantt/issues/421) is the spec. **This plan does not restate it.** Read the issue once, then this file, then work one build. Open questions and lone calls go in [`BUILD-LOG.md`](BUILD-LOG.md).

Opened 2026-09-16 at `d87cbdd`. Every line number below was measured there. **A line number is a hint. Open the file.**

> ## On hold, 2026-09-17 — Q17 is open. Do not start B1.
>
> A cold read found that ruled Option C keeps seven of the eight doubled doors the Q6 grill listed. **The leading design idea is now: a bar is a regular child Entry, and a row source rule draws a parent's children on its row.** Read [`CHILD-ENTRY-DESIGN.md`](CHILD-ENTRY-DESIGN.md).
>
> It is a proposal, not a ruling. Spike S4 decides it, and **S4 waits for the author's word.** If S4 passes, this plan is rewritten. If S4 fails, this plan stands, with the six fixes at the end of that file.

**Rewritten 2026-09-17 to Option C** (Q6–Q16). Every bar is a Segment. How many Segments a row has is the only difference between a plain row and a segmented one. Q1–Q16 are ruled. Q17 is open.

---

## Hard rules

1. **The issue decides. This plan orders.** When the two disagree, the issue wins, and you log a **Q**.
2. **No stored classification.** Nothing on a public type says "hidden", "authored", "plain" or names a variant. `plans/01` §2.5, ADR 0013, ADR 0018.
3. **A `read(key)` never falls through** (Q7). `segment.read('hours')` answers that Segment's own value, or nothing. **Navigation is not a read:** `segment.entry()` names the row, and `entry.segments` lists its Segments. **A derived cell is a write, not a read:** the Rollup writes the row's own cell, and the row reads that cell.
4. **Every bar is a Segment** (Q6, Q14). A plain row answers one Segment. A segmented row answers one per authored Segment. A seam about one bar takes a `Segment`, never `(entry, segment?)`.
5. **Segments and children are not special to the Rollup** (Q8, Q9). A row's cell rolls up over its Segments and its children, unioned, through the normal Aggregators. `start`/`end` are core Fields with `rollUp: 'min'`/`'max'`, like any consumer `rollUp`. No code path checks for `start`/`end`, or for a Segment-vs-child input. A special case for either is a bug.
6. **A segmented row obeys the rolling-up parent's rules** (Q10, Q11(e), ADR 0013). A row **derives** when it has children or authored Segments. A write to a derived cell is refused (`DerivedFieldNotWritableError`) unless the Field declares `distribute`. Derivation is read before the patch stages. A drag on the row moves its Segments and never writes the row.
7. **Text never decides whether a bar shows.** An empty label leaves geometry, fill, hit target, hover, selection and handles unchanged. One test pins this.
8. **Zoom never touches a Segment.** No folding, no read of the visible range. An Aggregator never writes onto a bar. A test pins the same printed value at day, week and year zoom.
9. **One key, one meaning.** One `fields` list. `Field.column` and `distribute` are Entry-only. A key with no `rollUp` shows an empty grid cell, as it does over children today.
10. **Every write is one transaction, one ChangeSet.** A Segment value write is one `store: 'segments'` row keyed by the Segment's id. A whole-array `segments` diff does not meet the issue for a value write.
11. **The hot path allocates nothing (I5).** A live `Segment` has one identity per id for the life of the store, as `LiveEntries` does. The `whenSegment` walk runs in the layout pass, never per pointer move.
12. **All date arithmetic goes through `time/`.** A Segment moves and resizes through the bound `TimeScale`.
13. **The harness never patches the library.** A cast, a side map or a re-derivation in `harness/` is an API gap. Stop, report, ask.
14. **Rename with `pk-rename-symbol`, then `pnpm typecheck`.** B1 has one rename whose meaning inverts while typecheck stays green. Its build says so.
15. **`pnpm verify:full` is the gate.** `pnpm verify:full > /tmp/v.log 2>&1; tail -3 /tmp/v.log`. Report the verdict line.
16. **Vendor Gantt names never appear here or in `src/`.** Scheduling vocabulary stays out of this work.
17. **Tick each box when you finish it, not at the end.**

---

## What the end state is

- **Every bar is a Segment.** A live `Segment` answers `id`, `start`, `end`, `name?`, `read(key)`, `entry()` and `toInput()`. It is a stored/live pair like `Entry` (ADR 0017).
- **One write door, on `dataset.entries`** (Q13). `update(id, edit)` patches a row. `updateSegment(id, edit)` patches one Segment. `addSegment(entryId, input)` and `removeSegments(ids)` add and remove Segments. There is no second collection.
- **The `segments` array replaces the list** (Q12). `update(id, { segments })` sets which Segments exist and their order. Each element replaces its Segment's values. Elements match by `id` only; the positional id match retires.
- **An authored Segment** stores `id`, `start`, `end`, `name?` and `props` inside its Entry's `segments` array.
- **A plain row's Segment is backed by the Entry** (Q10, Q14). A plain spanning Entry stores `segments: []`. `entry.segments` answers one live Segment. Its id is minted in a store index, never stored. It reads and writes the Entry's own record, so `updateSegment(plainId, { hours: 8 })` lands as a `store: 'entries'` row. This is backing, not a fallthrough: the plain Segment has no values of its own.
- **An Entry's dates have one source at a time** (Q1, Q2, Q4, Q9). A row that does not derive keeps the dates it named (ADR 0012). A row that derives — it has children or authored Segments — rolls `start`/`end` up over both with `min`/`max`. Clearing the Segments clears the dates, unless children remain to give it dates. A caller that wants a plain bar from a segmented row writes two calls in one transaction (Q11(e)). `envelopeOfSegments`, `reconcileEnvelope`, `fitSegmentsToEnvelope` and `widenSegmentsToEnvelope` retire into the Rollup.
- **A row's cell may roll up its Segments** (Q8). One input: Segments and children, unioned. No precedence, no source knob. `distribute` onto Segments is not ruled.
- **`name` is optional** on `EntryInput`, `StoredEntry`, `Entry`, `SegmentInput`, `StoredSegment`, `Segment`.
- **One `EntryVariant`, one new key** (Q11(a)). `when` picks rows. `whenSegment` picks bars and takes one `Segment`. Both present is AND. A variant with `whenSegment` cannot set `items`.
- **Bar gestures ask the bar; cell edits ask the cell** (Q11(b)). `move`/`resize`/`select` take a `Segment`. `capabilities.edit` stays `(entry, field)`, the grid cell rule.
- **A bar prints one Field** from its Segment, through that Field's `formatValue(value, ctx, owner)`, where `owner` is the `Entry` or `Segment` the value came from: the Entry in a grid cell, the Segment on a bar — a plain bar's Segment too, which reads the Entry's record. Default `name`.
- **An `EditExtender` returns `DatasetEdits`** (Q11(c)): `{ entries?: EntryEdits; segments?: SegmentEdits }`.
- **A bar that stands for several Segments gets all of them** (Q11(d)). `BarRendererContext` is `{ entry, segments, item, label? }`, and `segments` is never empty.

---

## The API, in call sites

Publish the invocation an author writes. Read each line aloud before you change a name.

| Job | Call site | New or changed |
|---|---|---|
| Author a Segment with data | `{ id: 'd1', start, end, hours: 8, color: 'red' }` inside `segments` | `SegmentInput` gains `name?` and flat declared keys; nested `props` also legal |
| Read a bar's value | `segment.read('hours')` | live `Segment.read(key)`. A plain row's Segment reads the Entry's record |
| Name the row a bar sits on | `segment.entry().name` | new; navigation (Q7) |
| List a row's bars | `entry.segments` | never empty for a spanning row; a plain row answers one |
| Total bar values onto the row | `{ key: 'hours', type: 'number', rollUp: 'sum' }` | `rollUp` reads Segments and children, unioned (Q8) |
| Patch one bar | `dataset.entries.updateSegment('d2', { color: 'grey' })` | new. On a plain bar it writes the Entry |
| Add one bar | `dataset.entries.addSegment('req-1', { start, end, hours: 8 })` | new; returns the live `Segment`. On a plain row the minted id drops, and the row starts rolling up its dates |
| Remove bars | `dataset.entries.removeSegments(['d1', 'd2'])` | unchanged name. A plain row's id un-dates the row. A derived row's id is refused with `DerivedFieldNotWritableError` (Q16). Writes one removed row per Segment (Q15) |
| Patch many bars, one undo | `dataset.transaction(() => { for (const id of ids) dataset.entries.updateSegment(id, { worker: 'Ali' }); })` | no change to `transaction()` |
| Set a row's bars | `dataset.entries.update('req-1', { segments: [{ id: 'd1', start, end, hours: 8 }, { start, end }] })` | replaces the list and each Segment's values; matches by `id`; no positional match (Q12) |
| Move a segmented row | drag the row, or `moveEntryTo` | moves every Segment, one `start`/`end` value row per Segment (Q15); the row's own `start`/`end` are not written (ADR 0013) |
| Write a segmented row's dates | `dataset.entries.update('req-1', { start })` | refused, `DerivedFieldNotWritableError`, like a rolling-up parent |
| Make a segmented row plain | `dataset.transaction(() => { entries.update(id, { segments: [] }); entries.update(id, { start, end }); })` | two calls, one undo (Q11(e)) |
| Copy an Entry | `dataset.entries.add({ ...entry.toInput(), id: 'copy' })` | `toInput()` emits authored Segments with `name`/`props` and no ids; no `segments` key for a plain row |
| Match a bar by value | `{ name: 'fullDay', whenSegment: { hours: 8 }, css }` | new key on `EntryVariant` |
| Match a bar by predicate | `{ name: 'overBooked', whenSegment: (segment) => (segment.read('hours') ?? 0) > 8, css }` | one argument |
| Match a row and its bars | `{ name: 'crew', when: { team: 'framing' }, whenSegment: { hours: 4 }, css }` | AND |
| Gate a gesture per bar | `capabilities: { resize: (segment) => segment.read('locked') !== true }` | `CapabilityRule` takes the `Segment` |
| Gate a grid cell write | `capabilities: { edit: (entry, field) => … }` | unchanged. A bar drag no longer asks it (Q11(b)) |
| Print a Field on every bar | `new Gantt({ barLabels: { field: 'hours', placement: 'inside' } })` | `BarLabels` gains the long form; the string shorthand stays |
| Print a Field on one variant's bars | `bar({ barLabels: { field: 'hours' } })` | `EntryVariant.barLabels`; overrides `field`, `placement` or both (J-plan-5) |
| Paint a bar | `paint: ({ entry, segments, item, label }) => …` | `BarRendererContext.segments`, never empty |
| Format a value | `formatValue: (value, ctx, owner) => \`${value} ${owner.read('currency') ?? ''}\`` | third argument is `Entry \| Segment`; `parseValue` stays `(text, ctx, entry)` |
| Read the change | `{ store: 'segments', id: 'd2', field: 'color', from: 'red', to: 'grey' }` | `StoreName` gains `'segments'` |
| Propose a cascade | `ctx.edits.setExtender((next) => (request) => mergeDatasetEdits(next(request), { segments: new Map([['d1', { hours: 8 }]]) }))` | `EditExtender` returns `DatasetEdits`; `mergeEntryEdits` becomes `mergeDatasetEdits` |

**Names that stay off the app-author surface:** `StoredSegment` (plugin surface: ChangeSet entity, `EditRequest`) and `resolveForSegment` (internal). The minted id is an ordinary `SegmentId`; nothing marks it as minted.

---

## The plain bar — how core knows a Segment is not authored

**Answer: there is no hidden Segment record. There is a minted id, and the Entry backs it.** Q14 weighed storing a Segment for every spanning row, and refused it: a stored Segment makes every leaf derive, so every leaf's rolling-up cell turns read-only. The log has the full case.

- `StoredEntry.segments` holds authored Segments only. A plain spanning Entry stores `segments: []`, and `toInput()` emits no `segments` with no filter and no flag.
- The store keeps **one minted `SegmentId` per plain spanning Entry** in an index (`data/entry-store.ts`, beside `#entryIdBySegmentId` at `:523`). Core mints it when an Entry becomes plain and spanning. Core drops it when the Entry stops spanning or gains authored Segments. It is not data: no `StoredEntry` field, no ChangeSet row, no `toInput()` key (J-plan-1).
- **The live plain Segment is backed by the Entry.** `read`, `start`, `end` and `name` answer the Entry's own values. `updateSegment` on it lands as `store: 'entries'` rows on the Entry. So the minted id never reaches a ChangeSet row.
- `entryIdOfSegment`, `entryIdsOfSegments` and `segmentIdsOfEntries` answer the minted id (`entry-store.ts:463`). Selection, `removeSegments`, keyboard select, grid-row click and `reveal` (`gantt-shell.ts:2101`) keep working.
- **A summary parent is a plain row.** Its dates roll up from children, and it answers one minted Segment. `summary()` is a variant over that Segment.
- **`addSegment` on a plain row makes it authored.** The minted id drops, and the new Segment's id names the bar. The row starts deriving `start`/`end`, and its authored dates drop — ADR 0013's rule for an Entry that starts rolling up. The Selection follows J-plan-2.
- **Stable across a date edit and an undo.** A drag on a plain bar writes the Entry's `start`/`end`, never `segments`. S3 measured this.
- **`layout/` may keep reading `entry.segments`.** A live plain row now answers its minted Segment there, so the `LayoutInput` port the first plan needed may be unnecessary. B2 checks whether `frame-memory.ts:127,157` read the live or the stored Entry, and logs a **J**.

**Every site that reads `segments`, and what it does after B2 and B3** (measured at `d87cbdd`; 59 non-test sites, 37 test files):

| Site | Today | After |
|---|---|---|
| `data/entry-reader.ts:122-132` `toSegments` | fills one Segment for a spanning Entry | stored: `[]` when none authored. Live: the plain Segment |
| `data/entry-reader.ts:316-360` `reconcileEnvelope` | a sole Segment mirrors a `start`/`end` write | **retires (Q9).** The Rollup writes a segmented row's dates. A consumer write to them is refused (Q10) |
| `data/entry-reader.ts:101` `toSegment` | builds `{ id, start, end }` | builds `{ id, start, end, name?, props }` from the element alone (Q12) |
| `data/entry-reader.ts:602-614` positional match | an element with no `id` keeps the id at its position | **retires (Q12).** An element with a known `id` replaces that Segment; any other element is new |
| `data/entry-reader.ts:444` `moveEntryTo` | returns a `segments` write | plain → `{ start, end }`; segmented → a `start`/`end` edit per Segment, keyed by `SegmentId` (Q15), the row not written (J-plan-4) |
| `data/entry-reader.ts:606` `EmptySegmentsError` | refuses `segments: []` | **retires (Q1)** |
| `data/rollup.ts:180-186` | mints a Segment for a derived parent, pushes a `segments` row | writes `start`/`end` only; the store mints the plain id on apply |
| `data/rollup.ts:164-197` `widenSegmentsToEnvelope`, `fitSegmentsToEnvelope` | fit Segments to a new envelope | **retire (Q9).** The Rollup reads Segments as input and never writes them |
| `time/instant.ts:56-68` `envelopeOfSegments` | min/max over spans | **retires (Q9)** into the `min`/`max` Aggregators |
| `data/entry-store.ts:433-457` `#hasChildren` | children, as the transaction leaves them | **becomes `#derives`** (Q11(e)): children or authored Segments. `resolveWriteTarget` takes it |
| `data/entry-store.ts:720` `#removeSegmentsFrom` | removes by id, un-dates on last | the minted id un-dates a plain row; on a derived row it refuses with `DerivedFieldNotWritableError`, where today it skips the date clear in silence (Q16). The last authored Segment un-dates the row (Q2). One removed row per Segment (Q15) |
| `data/change-set.ts:128` `segmentIdsDroppedBy` | diffs `segments` rows | deleted. The Selection drops an id when `entryIdOfSegment(id)` is `undefined` after a commit |
| `data/live-entry.ts:163` `toInput` | emits `segments` with ids | authored only, `name` + `props`, no ids |
| `data/fields/field-access.ts:220` `measureDuration: 'segments'` | sums Segments | sums the live Segments; a plain row answers its span |
| `layout/gesture-draft.ts:112-125,264` | rewrites `segments` | plain → `start`/`end` draft; authored → a `start`/`end` draft per Segment it moves, committed as value rows (Q15), data untouched |
| `layout/items/item.ts:180` `followSegments` | one Item per Segment, else whole span | one Item per live Segment; a plain Item carries the minted id |
| `layout/frame-memory.ts:127,157` | reads `entry.segments` | see the last bullet above |
| `extensions/features/inline-editing.ts:89` | `segments.length <= 1` | unchanged in meaning |
| `view/gantt-shell.ts:2103` `reveal` | finds the Segment on the owner | unchanged; the minted id resolves like any id |
| `layout/entry-double.ts` (test-only) | builds an `Entry` | also builds live `Segment`s |

---

## Invariants this work touches

| Invariant | Where it bites | How the build proves it |
|---|---|---|
| **I2** no module state | live `Segment` cache, variant resolution | cache lives on the store; the two-Gantt isolation test gains a `whenSegment` rule |
| **I5** hot path allocates nothing | `whenSegment` walk, `segment.read()` on hover | walk runs in the layout pass and the frame carries the winner; `applyState` perf test unchanged |
| **I8** `Item.id` deterministic | plain bar keeps index 0; authored Segments keep array index. `Item.id` is frame identity: after a reorder the Item ids follow the new index, and the Segment ids stay | layout snapshot test gains a segmented row |
| **I14** one resolution for chrome and gesture | handles per bar, `canGesture(item)` asks every Segment the bar stands for | `e2e/write-refusal.spec.ts` gains a locked Segment beside a free one |

---

## The stored/live migration for `Segment`

Mirror ADR 0017 exactly. Do not invent a third shape.

1. `pk-rename-symbol` today's `Segment` → `StoredSegment`. **Typecheck stays green while the meaning inverts.** Then add `name?: string` and `props: Readonly<Partial<TProps>>`.
2. Declare the new live `Segment` in `model/segment.ts`: `id`, `start`, `end`, `name?`, `read(key)`, `entry()`, `toInput()`. No `props` on the read surface, the same rule the row follows.
3. Build it in `data/live-segment.ts` beside `LiveEntries`: one instance per `SegmentId`, identity stable for the store's life, reads through the store so an open transaction overlays it. A plain row's instance reads the Entry's record.
4. `StoredEntry.segments: readonly StoredSegment[]`. `Entry.segments: readonly Segment[]`.
5. **A bar seam takes `Segment`:** `whenSegment`, `CapabilityRule`, `BarRendererContext.segments`, `formatValue`'s `owner`. **The edit pipeline carries `StoredSegment`:** `ProposedEdit.segments`, `EditRequest`, ChangeSet rows, `toSegment`.
6. `SegmentInput` gains `name?` and props, read by the same `readProps` path `EntryInput` uses. Same warnings, same `DuplicatePropsKeyError`.

---

## Spikes — S1 to S3 ran 2026-09-16 and are answered; S4 is planned

**Read [`SPIKE-FINDINGS.md`](SPIKE-FINDINGS.md) once before B1.** The rulings are J1, J2 and J3 in the log. The measurements stand. Where a spike recommended a shape, Q6–Q13 replaced the shape and kept the measurement.

| Spike | Answer | Lands in |
|---|---|---|
| **S1** ChangeSet address | Today no row can name one Segment. A second apply path is small: one diff that reads `segment.read(field)`, one apply branch. `invertChangeSet` needs no change, so undo by id falls out. The branch keys on `store: 'segments'` | B4 |
| **S2** handle pair | **Rule B already ships.** `projectAffordances` brackets the row and gates each edge. The gap is that `Capabilities.can` takes no Segment, and hover does not thread the hovered Item into edge resolution | B6 |
| **S3** plain bar's id | The minted id is **stable across drag and undo with no ChangeSet row**. `removeSegments` un-dates with no code change | B2 |
| **S4** a bar is a child Entry | **Planned, not run. Waits for the author's word** (Q17). Questions, method and pass rule are in [`CHILD-ENTRY-DESIGN.md`](CHILD-ENTRY-DESIGN.md) | decides whether B1–B8 run at all |

---

## Build order

Each build lands as one change with `verify:full PASS`. Change the order only with a stated reason.

```
B1  →  B2  →  B3  →  B4  →  B5  →  B6  →  B7  →  B8
```

| Build | Job | Lands after | Gate |
|---|---|---|---|
| **B1** Segment data | `StoredSegment`/`Segment` pair, `entry()`, `name?` everywhere, Segment props at ingest, `toSegment` reads data, `toInput()` copies | — | ingest tests; copy test creates new Segment ids; grid shows empty name cell |
| **B2** The plain bar | `segments: []` stored for plain, minted id in the index, live plain Segment backed by the Entry, Rollup writes a parent's dates without minting, draft, Selection drop rule, `layout/` read check. **`EmptySegmentsError` retires (Q1).** | B1 | S3's assertions as real tests; a plain Segment's `read` answers the Entry's value; a summary parent answers one Segment; `update(id, { segments: [] })` alone is legal and un-dates; `removeSegments` on a summary parent's id throws `DerivedFieldNotWritableError` (Q16); every `segments` reader in the table re-read once |
| **B3** The Rollup reads Segments | Rollup input is children ∪ Segments; the four envelope paths retire; `#hasChildren` → `#derives`; a derived `start`/`end` write refuses; the `segments` array replaces by `id` and the positional match retires (Q12) | B2 | `rollUp: 'sum'` totals day `hours` onto the row; Segments + child union test; `start`/`end` go through the same code as children (no key check); row-date write throws `DerivedFieldNotWritableError`; the two-call plain-bar transaction is one undo; a reorder keeps every id |
| **B4** Segment writes | `updateSegment`, `addSegment`, `store: 'segments'` rows, per-Segment apply/replay/undo, plain writes land as `store: 'entries'` rows, `DatasetEdits` + `mergeDatasetEdits`, the two double-answer refusals; structural rows per Q15 — `addSegment` one added row, `removeSegments` one removed row per Segment, a drag commit and `moveEntryTo` one `start`/`end` value row per Segment, only `update(id, { segments })` a whole-array row | B3 | S1's assertions as real tests; `addSegment` beside `updateSegment` on a sibling in one transaction commits and undoes in one step; a row drag writes no whole-array row; `update(id, { segments })` beside a `store: 'segments'` row for the same Entry is refused; `addSegment` refuses a duplicate id like `add`; ten updates in one transaction are one undo; an extender's `segments` cascade undoes with the user's edit; `updateSegment` on a plain bar writes `store: 'entries'` rows and no row names the minted id; each refusal has a test |
| **B5** Variants per bar | `EntryVariant.whenSegment` (field match or `(segment) => boolean`), `items?: never` beside it, frame carries the winner per bar, `resolveBarRenderer(item)`, `BarRendererContext.segments`, `DoubleVariantClaim` names the Segment, `UnknownFieldMatch` for `whenSegment` | B4 | every shipped rule claims the same bars as before (snapshot); `whenSegment: { hours: 8 }` claims exactly those bars; a bar over several Segments is never claimed by `whenSegment`; `{ whenSegment, items }` does not compile |
| **B6** Capabilities per bar | `CapabilityRule(segment)`, `can()` asks every Segment the bar stands for (one refusal refuses), `canGesture(item)` at every caller, handles per bar (S2's rule), grid-row click selects only bars that allow select, bar drags stop asking `capabilities.edit` | B5 | `e2e/write-refusal.spec.ts` locked Segment; a11y and keyboard paths ask the same `can`; `edit` still gates the cell editor |
| **B7** Labels | `BarLabels` long form, `EntryVariant.barLabels`, label resolved in layout from the Segment through `formatValue(value, ctx, owner)`, a11y label from printed text or dates, empty-label geometry test, day/week/year zoom test | B5 | the two pinned tests; a plain bar still prints `entry.name` |
| **B8** Harness, glossary, docs | one segmented row with per-bar text, colour, capabilities and a row total; one plain bar with no name; `CONTEXT.md` Segment/Item/Variant entries; the ADR that revises ADR 0012 (Q1) and ADR 0013 (Q9, Q11(e)); `docs/` consumer page; close #421 | B6, B7 | `harness/main.ts` reviewed; acceptance list in #421 all ticked |

**Why this order.** B2 before B3: the Rollup must not mint a Segment before it reads Segments. B3 before B4: a Segment write re-runs the Rollup, so the Rollup reads Segments first. B5 before B6: `can` per bar reads the `whenSegment` winner. B7 after B5: a per-variant label reads the same winner.

**What the spikes measured.** Read `SPIKE-FINDINGS.md` for the evidence.

- **B2.** The Rollup mints and stores its own `segments` array row at `data/rollup.ts:180-189`, on a path that never calls `toSegments`. Stop that mint. Expect wide test breakage: the `data/`-layer change **alone** broke 37 tests in 8 files, 20 of them in `api/gantt.test.ts`. Those are deep end-to-end paths over the readers the table names, not readers the table missed.
- **B4.** The apply path is two pieces: a segment-scoped diff beside `diffEdit` (`data/change-set.ts:53-73`) that reads `segment.read(field)`, and one branch in `#applyUpdatedRows` (`data/entry-store.ts:937-946`) keyed on `row.store === 'segments'`. `invertChangeSet` (`:150-156`) already swaps `from`/`to` per row, so undo and replay need nothing. The Rollup then writes the row's `start`/`end` rows in the same transaction.
- **B6.** S2 confirmed rule B ships already: `resolveResizableEntry` (`view/affordance-projection.ts:86-114`) brackets the row and `resolveEdges` (`:72-79`) asks the two edges independently. Two gaps remain. `Capabilities.can` (`view/capability.ts:34-36`) and `#canGesture` (`view/gantt-shell.ts:1838-1841`) take `(capability, entry, edge?)`. And hover does not thread the hovered Item in. Close both by resolving `start`/`end` from the row's first and last `ItemId` through `itemIdsForEntry`, and asking `can` for the Segments that Item stands for.

**Wide mechanical changes.** B1's `name?` touches every `entry.name` read. Let `pnpm typecheck` list them. Do not add `?? ''` at a read site that should print nothing; add it only where a `string` is required by a DOM API.

---

## Decisions this plan makes

Reversible. Each is a **J** in the log when a build takes it.

- **J-plan-1.** The plain bar's id lives in a store index, never in a record or a ChangeSet row. A write through it lands on the Entry.
- **J-plan-2.** `segmentIdsDroppedBy` goes. The Selection keeps an id while the store resolves it.
- **J-plan-3.** `update(id, { segments })` is the structural door and writes one `segments` row. It is the only whole-array row. A value write through `updateSegment`, a drag commit or `moveEntryTo` is one `store: 'segments'` row per Segment and Field. `addSegment` writes one added row; `removeSegments` one removed row per Segment, mirroring `EntityAdded`/`EntityRemoved` (Q15). `update(id, { segments })` beside any `store: 'segments'` row for the same Entry in one transaction is refused.
- **J-plan-4.** `moveEntryTo` returns `{ start, end }` for a plain row. For a segmented row it returns a `start`/`end` edit per Segment, keyed by `SegmentId` inside `DatasetEdits` (Q15), and never writes the row, as a parent drag does (ADR 0013).
- **J-plan-5.** A variant's `barLabels` merges over the Gantt's key by key: `{ field }` alone keeps the Gantt's placement.
- **J-plan-6.** The live `Segment` exposes `read(key)`, `toInput()` and `entry()`, and no `props` (Q7).
- **J-plan-7.** Internal `Capabilities.can(capability, segments, edge?)` takes the non-empty Segments the bar stands for. No caller passes `undefined`. Run the naming skill on the object alternative before B6 and log the choice.

---

## User stories

Each story is one acceptance test. The consumer brief is `plans/handoff/2026-09-15-crm-filament-labor.md` §3.

1. **A crew lead sees one bar per day.** A labour request spans two weeks. Each day is a Segment with `hours`, `worker` and `filled`. The row shows one bar per day, each with its own text and colour. A weekend gap draws nothing.
2. **The row shows the total.** `hours` declares `rollUp: 'sum'`. The request row's grid cell reads the sum of its days. It reads the same number at every zoom.
3. **A filled day looks different from an open one.** `{ name: 'filled', whenSegment: { filled: true }, css }`. No renderer, no side map. The rule claims exactly the filled bars.
4. **A locked day cannot be resized, its neighbours can.** `capabilities: { resize: (segment) => segment.read('locked') !== true }`. The locked bar shows no handle. The bar beside it shows both. Dragging the locked edge does nothing.
5. **A dispatcher assigns one worker to ten days in one step.** Ten `dataset.entries.updateSegment(id, { worker: 'Ali' })` calls inside one `transaction`. One ChangeSet, ten `store: 'segments'` rows. One undo clears all ten.
6. **A planner copies a request.** `dataset.entries.add({ ...entry.toInput(), id: 'copy' })`. The copy has every day's data and fresh Segment ids. Nothing throws.
7. **A booking with no title is still a bar.** `{ id: 'hold', start, end }`. The grid's name cell is empty. The bar draws, hovers, selects and resizes like any other. A screen reader hears the dates.
8. **The same rule reads a plain bar.** `resize: (segment) => segment.read('locked') !== true` on a plain row with `locked: true` refuses the resize. The plain Segment reads the Entry's record.
9. **A bar prints hours, not its name.** `bar({ barLabels: { field: 'hours' } })`. The bar reads `8 h` through the Field's `formatValue`, the same text the grid shows. At year zoom it is a sliver and still reads `8 h` on hover.
10. **A lead adds a day to a request.** `dataset.entries.addSegment('req-1', { start, end, hours: 8 })`. One new bar appears. The other bars keep their ids, so the Selection is unchanged. The row total grows by 8. Undo removes the bar, its data and the total change.
11. **A drag keeps the data.** The lead drags a day one column right. The bar moves. Its `worker`, `hours` and `filled` are unchanged. Undo moves it back and the Selection still holds it.
12. **A request moves as a whole.** The lead drags the request row. Every day moves. `entries.update('req-1', { start })` is refused with `DerivedFieldNotWritableError`.
13. **A planner reorders the days.** `entries.update('req-1', { segments: [d2, d1] })`, each element with its `id`. Both bars keep their ids and data. The Selection is unchanged.

---

## Files a build touches most

| Area | Files |
|---|---|
| model | `model/stored-entry.ts`, `model/segment.ts` (new), `model/change-set.ts`, `model/capabilities.ts`, `model/field.ts:149-169,230`, `model/plugin.ts:32`, `model/dataset.ts:51-69` |
| data | `data/entry-reader.ts`, `data/entry-store.ts`, `data/rollup.ts`, `data/write-rule.ts`, `data/edit-extension.ts`, `data/live-entry.ts`, `data/live-segment.ts` (new), `data/change-set.ts`, `data/replay.ts`, `data/dataset-state.ts:201-264,298`, `data/fields/core-fields.ts` |
| time | `time/instant.ts` (`envelopeOfSegments` retires) |
| layout | `layout/items/variants.ts:49-111,382-530`, `layout/items/item.ts:93-110,180`, `layout/items/produce-items.ts`, `layout/frame.ts:136-156,271,353`, `layout/frame-memory.ts:110-160`, `layout/gesture-draft.ts`, `layout/renderer.ts:29-38,94` |
| view | `view/gantt-shell.ts:716,875,900,929,1352,1415,1838`, `view/affordance-projection.ts`, `view/capability.ts:34-179`, `view/grid-columns.ts:117-131`, `view/segment-selection.ts:121-140` |
| render | `render/dom/index.ts:98,201-260,1172` (label, handle and paint lookup) |
| api | `api/dataset-plugin.ts:34-68` (`mergeDatasetEdits` re-export) |
| consumer | `harness/main.ts`, `fixtures/demo-dataset.ts`, `CONTEXT.md:67-73,142-154,212-262`, `e2e/selection.spec.ts`, `e2e/write-refusal.spec.ts` |
