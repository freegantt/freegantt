# A Segment is a bar — the build plan for #421

[#421](https://github.com/Pawel-IT/FreeGantt/issues/421) is the spec. **This plan does not restate it.** Read the issue once, then this file, then work one build. Open questions and lone calls go in [`BUILD-LOG.md`](BUILD-LOG.md).

Opened 2026-09-16 at `d87cbdd`. Every line number below was measured there. **A line number is a hint. Open the file.**

---

## Hard rules

1. **The issue decides. This plan orders.** When the two disagree, the issue wins, and you log a **Q**.
2. **No stored classification.** Nothing on a public type says "hidden", "authored", "plain" or names a variant. `plans/01` §2.5, ADR 0013, ADR 0018.
3. **A `read(key)` never falls through** (Q7, ruled 2026-09-16). `segment.read('hours')` answers that Segment's own value, or nothing. It never answers the Entry's. The same holds in a label and in a rule. **Navigation is not a read:** `segment.entry()` names the row, and `entry.segments` lists the pieces. **A derived cell is a write, not a read:** the Rollup and the envelope write the row's own cell, and the row reads that cell.
4. **Text never decides whether a bar shows.** An empty label leaves geometry, fill, hit target, hover, selection and handles unchanged. One test pins this (B6).
5. **Zoom never touches a Segment.** No folding, no read of the visible range. **An Aggregator never writes onto a bar** (Q8). A test pins the same printed value at day, week and year zoom (B6).
6. **One key, one meaning.** One `fields` list. `Field.column` and `distribute` are Entry-only. **`rollUp` may read Segments** (Q8): an Aggregator writes a row's cell from its Segments and its children, unioned, with no precedence and no source knob. A key with no `rollUp` shows an empty grid cell, as it does over children today.
7. **Every write is one transaction, one ChangeSet.** `updateSegment` names the Segment on the row. A whole-array `segments` diff does not meet the issue for a value write.
8. **The hot path allocates nothing (I5).** A live `Segment` has one identity per id for the life of the store, as `LiveEntries` does. The Item-phase variant walk runs in the layout pass, never per pointer move.
9. **All date arithmetic goes through `time/`.** A Segment moves and resizes through the bound `TimeScale`.
10. **The harness never patches the library.** A cast, a side map or a re-derivation in `harness/` is an API gap. Stop, report, ask.
11. **Rename with `pk-rename-symbol`, then `pnpm typecheck`.** B1 has one rename whose meaning inverts while typecheck stays green. Its build says so.
12. **`pnpm verify:full` is the gate.** `pnpm verify:full > /tmp/v.log 2>&1; tail -3 /tmp/v.log`. Report the verdict line.
13. **Vendor Gantt names never appear here or in `src/`.** Scheduling vocabulary stays out of this work.
14. **Tick each box when you finish it, not at the end.**

---

## What the end state is

- A **Segment** stores `id`, `start`, `end`, `name?` and `props`. It is a stored/live pair like `Entry` (ADR 0017): `StoredSegment` holds values, `Segment` answers `read(key)`.
- A **plain Entry** (dates, no authored Segments) stores `segments: []`. `entry.segments` is `[]`. Its bar is still selectable through one minted `SegmentId` that lives in a store index, not in a record (§ The plain bar).
- **An Entry's dates have one source at a time** (ruled 2026-09-16, Q1/Q2/Q4). With no Segments, the Entry keeps the dates it named, read straight (ADR 0012). With Segments, its span **is** their envelope — the lowest `start` and the highest `end`, which `envelopeOfSegments` already computes (`time/instant.ts:56-68`). So clearing the Segments clears the dates, through either door, and a caller that wants a plain bar names the dates in the same edit: `update(id, { segments: [], start, end })`. **The envelope is the Rollup** (Q9, ruled 2026-09-17): `start` and `end` roll up from Segments to the row through the normal `min` and `max` Aggregators. They are not special: they are the same Aggregators and the same Rollup that `start`/`end` use over children, declared on the core Fields like any consumer `rollUp`. No code path checks for `start`/`end` or for Segment-vs-child input. `envelopeOfSegments`, `reconcileEnvelope`, `fitSegmentsToEnvelope` and `widenSegmentsToEnvelope` retire into the Rollup.
- **A row's cell may aggregate its Segments** (Q8, ruled 2026-09-16). A Field with `rollUp` writes the row's cell over the row's Segments and its children, unioned. An Aggregator never writes a bar's value, so zoom never changes a total.
- **`name` is optional** on `EntryInput`, `StoredEntry`, `Entry`, `SegmentInput`, `StoredSegment`, `Segment`.
- **A variant resolves in two phases.** Row phase decides `items`. Item phase decides `paint`, `css`, `can`, `barLabels` for each Item that draws an authored Segment.
- **`can` and the resize handles resolve per Item.** Chrome and gesture read one answer (I14).
- **A bar prints one Field**, from where its Item reads, through that Field's `formatValue`. Default `name`.
- **`entries.updateSegment(id, edit)`** writes one Segment. The ChangeSet row is `{ store, id, segmentId, field, from, to }`. **`entries.addSegment(entryId, input)`** adds one and returns it. With `removeSegments`, a consumer can add, change and remove a Segment without rebuilding the array.

---

## The API, in call sites

Publish the invocation an author writes. Read each line aloud before you change a name.

> **This table is stale. Q6 is ruled: Option C, one door (2026-09-17).** `updateSegment`, `addSegment`, `removeSegments`, `whenSegment`, `SegmentEdits`, `FieldUpdated.segmentId` and every `(entry, segment?)` pair below do not ship. One id, one live type, one collection, and each seam takes one object. Rewrite this table, B3–B6, J-plan-3/7/8 and the user stories to C, after the naming skill picks the piece's name. Do not build from the rows below.

| Job | Call site | New or changed |
|---|---|---|
| Author a Segment with data | `{ id: 'd1', start, end, hours: 8, color: 'red' }` inside `segments` | `SegmentInput` gains `name?` and flat declared keys, nested `props` also legal |
| Read a Segment's value | `segment.read('hours')` | live `Segment.read(key)` |
| Name the row a Segment sits on | `segment.entry().name` | new; navigation, never a value fallthrough (Q7, J-plan-6 reversed) |
| Total Segment values onto the row | `{ key: 'hours', type: 'number', rollUp: 'sum' }` | `rollUp` reads the row's Segments and children, unioned (Q8) |
| Write one Segment | `dataset.entries.updateSegment('d2', { color: 'grey' })` | new; sibling of `removeSegments` |
| Add one Segment | `dataset.entries.addSegment('req-1', { start, end, hours: 8 })` | new; returns the live `Segment`. Singular like `updateSegment`; many go through `transaction()` |
| Write many Segments, one undo | `dataset.transaction(() => { for (id of ids) entries.updateSegment(id, { worker: 'Ali' }); })` | no change to `transaction()` |
| Copy an Entry | `entries.add({ ...entry.toInput(), id: 'copy' })` | `toInput()` emits Segment `name`/`props`, no Segment ids, no `segments` key for a plain Entry |
| Match a Segment by value | `{ name: 'fullDay', whenSegment: { hours: 8 }, css }` | new key on `EntryVariant` |
| Match a Segment by predicate | `when: (entry, segment) => (segment?.read('hours') ?? 0) > 8` | `VariantPredicate` gains `segment?` |
| Gate a gesture per Segment | `interactions: { resize: (entry, segment) => segment?.read('locked') !== true }` | `CapabilityRule` gains `segment?` |
| Gate a write per Segment | `interactions: { edit: (entry, field, segment) => … }` | `WriteRule` gains `segment?` as third argument |
| Print a Field on every bar | `new Gantt({ barLabels: { field: 'hours', placement: 'inside' } })` | `BarLabels` gains the long form; string shorthand stays |
| Print a Field on one variant's bars | `bar({ barLabels: { field: 'hours' } })` | `EntryVariant.barLabels`, overrides field or placement or both |
| Paint a Segment's bar | `paint: ({ entry, segment, item, label }) => …` | `BarRendererContext.segment?` |
| Format a value on a bar | `formatValue(value, ctx, entry, segment)` | fourth argument, present when the Item draws a Segment |
| Read the change | `{ store: 'entries', id, segmentId, field: 'color', from: 'red', to: 'grey' }` | `FieldUpdated.segmentId?` |

**Names that stay off the app-author surface:** `StoredSegment` (plugin surface: ChangeSet entity, `EditRequest`), the plain bar's minted id (visible only as a `SegmentId` in the Selection and in `removeSegments`), `resolveForSegment` (internal).

**Two rules in one `EntryVariant`:** `when` reads the Entry, `whenSegment` reads the Segment, both present is AND. `whenSegment` alone never claims a row and never answers `items`.

---

## The plain bar — how core knows a Segment is hidden

**Answer: there is no hidden Segment record. There is a hidden id.**

- `StoredEntry.segments` holds authored Segments only. A plain spanning Entry stores `segments: []`. So `entry.segments` is `[]` and `toInput()` emits no `segments` with no filter and no flag.
- The store keeps **one minted `SegmentId` per plain spanning Entry** in an index (`data/entry-store.ts`, beside `#entryIdBySegmentId` at `:523`). Core mints it when an Entry becomes plain-and-spanning. Core drops it when the Entry stops spanning or gains authored Segments. It is not data: no `StoredEntry` field, no ChangeSet row, no `toInput()` key.
- `entryIdOfSegment`, `entryIdsOfSegments` and `segmentIdsOfEntries` answer it (`entry-store.ts:493`). Selection, `removeSegments`, keyboard select, grid-row click and `reveal` (`gantt-shell.ts:2101`) already read those three doors, so they keep working.
- **`addSegment` on a plain Entry makes it authored.** The plain bar's id drops, and the new Segment's id names the bar. The Selection follows J-plan-2.
- **Stable across a date edit and an undo.** A `start`/`end` row leaves the id alone. A drag on a plain bar writes `start`/`end`, never `segments`. This is what "a drag keeps the Entry plain" means in code.
- **`layout/` stops reading `entry.segments` for selection ids.** `frame-memory.ts:127,157` read `entry.segments` to answer "which Segments does this Item stand for". A plain Item now has none there. The frame asks the store's `segmentIdsOfEntries` through a `LayoutInput` port instead. `layout/` still never imports `data/`.

**Every site that reads `segments`, and what it does after B2** (measured at `d87cbdd`; 59 non-test sites, 37 test files):

| Site | Today | After |
|---|---|---|
| `data/entry-reader.ts:122-132` `toSegments` | fills one Segment for a spanning Entry | returns `[]` when none authored |
| `data/entry-reader.ts:316-360` `reconcileEnvelope` | a sole Segment mirrors a `start`/`end` write | `segments: []` → dates write alone. One authored Segment keeps today's mirror. Two or more → `SegmentsOutOfSyncError` unchanged |
| `data/entry-reader.ts:101` `toSegment` | builds `{ id, start, end }` | keeps `name` and `props` from `existing` when the input names neither |
| `data/entry-reader.ts:444` `moveEntryTo` | returns a `segments` write | plain → `{ start, end }`; authored → `segments` with each Segment's data kept |
| `data/rollup.ts:180-186` | mints a Segment for a derived parent, pushes a `segments` row | writes `start`/`end` only; the store mints the plain bar's id on apply |
| `data/rollup.ts:192` `fitSegmentsToEnvelope` | fits all | fits authored only, data kept |
| `data/entry-store.ts:720` `#removeSegmentsFrom` | removes by id, un-dates on last | also accepts the plain bar's id: un-dates the Entry. The last authored Segment un-dates it too (Q2, ruled) — S3 measured this branch working with no code change |
| `data/change-set.ts:128` `segmentIdsDroppedBy` | diffs `segments` rows | deleted. The Selection drops an id when `entryIdOfSegment(id)` is `undefined` after a commit |
| `data/live-entry.ts:163` `toInput` | emits `segments` with ids | authored only, `name` + `props`, no ids |
| `data/fields/field-access.ts:220` `measureDuration: 'segments'` | sums Segments | sums authored Segments; a plain Entry answers its span |
| `layout/gesture-draft.ts:112-125,264` | rewrites `segments` | plain → `start`/`end` draft; authored → `segments` draft, data kept |
| `layout/items/item.ts:180` `followSegments` | one Item per Segment, else whole span | unchanged; plain Item has no `segmentId` |
| `layout/frame-memory.ts:127,157` | reads `entry.segments` | reads the `LayoutInput` port |
| `extensions/features/inline-editing.ts:89` | `segments.length <= 1` | unchanged in meaning; `[]` and `[one]` both pass |
| `view/gantt-shell.ts:2103` `reveal` | finds the Segment on the owner | plain bar's id → reveal the Entry span |
| `layout/entry-double.ts` (test-only) | builds an `Entry` | also builds live `Segment`s |

---

## Invariants this work touches

| Invariant | Where it bites | How the build proves it |
|---|---|---|
| **I2** no module state | live `Segment` cache, variant resolution | cache lives on the store; the two-Gantt isolation test gains a Segment variant |
| **I5** hot path allocates nothing | Item-phase walk, `segment.read()` on hover | walk runs in the layout pass and the frame carries the winner; `applyState` perf test unchanged |
| **I8** `Item.id` deterministic | plain bar keeps index 0; authored Segments keep array index | layout snapshot test gains a segmented row |
| **I14** one resolution for chrome and gesture | handles per Item, `canGesture(item)` | `e2e/write-refusal.spec.ts` gains a locked Segment beside a free one |

---

## The stored/live migration for `Segment`

Mirror ADR 0017 exactly. Do not invent a third shape.

1. `pk-rename-symbol` today's `Segment` → `StoredSegment`. **Typecheck stays green while the meaning inverts.** Then add `name?: string` and `props: Readonly<Partial<TProps>>`.
2. Declare the new live `Segment` in `model/segment.ts`: `id`, `start`, `end`, `name?`, `read(key)`, `toInput()`. No `props` on the read surface, the same rule the row follows.
3. Build it in `data/live-segment.ts` beside `LiveEntries`: one instance per `SegmentId`, identity stable for the store's life, reads through the store so an open transaction overlays it.
4. `StoredEntry.segments: readonly StoredSegment[]`. `Entry.segments: readonly Segment[]`.
5. **A read seam takes `Segment`:** variant rules, `CapabilityRule`, `WriteRule`, `BarRendererContext`, `formatValue`. **The edit pipeline carries `StoredSegment`:** `ProposedEdit.segments`, `EditRequest`, ChangeSet rows, `toSegment`.
6. `SegmentInput` gains `name?` and props, read by the same `readProps` path `EntryInput` uses. Same warnings, same `DuplicatePropsKeyError`.

---

## Spikes — run 2026-09-16, all three answered

**All three spikes are done. Read [`SPIKE-FINDINGS.md`](SPIKE-FINDINGS.md) once before B1.** The rulings are J1, J2 and J3 in the log. Nothing blocks the build, and no spike reversed a design. What each one changed is folded into the build table below. The probes are deleted; the text below states what each one asked, so a reader can judge the answer.

| Spike | Answer | Lands in |
|---|---|---|
| **S1** ChangeSet address | The second apply path is real and small: one `FieldUpdated.segmentId?`, one segment-scoped diff, one apply branch. `invertChangeSet` needs no change, so undo-by-id falls out | B3, and **Q4** |
| **S2** handle pair | **Rule B already ships.** `projectAffordances` brackets the envelope and gates each edge. The gap is that `Capabilities.can` takes no Segment, and hover does not thread the hovered Item into edge resolution | B5 |
| **S3** plain bar's id | The minted id is **stable across drag and undo with no ChangeSet row** — it is never in one, so undo has nothing to get wrong. `removeSegments` un-dates with no code change | B2 |

Each spike was a probe test, run once, then **deleted**. The issue named the first two. The third was this plan's.

**S1 — the ChangeSet address (about 1 hour).** A two-Segment Entry. `updateSegment('d2', { color: 'grey', end })`. Assert one transaction, rows `{ id, segmentId: 'd2', field: 'color' }` and `{ …, field: 'end' }` plus the Entry's `end` envelope row. `replay` of the undo ChangeSet restores the Segment by id, not by position. `beforeChange` and an `EditExtender` see the `segmentId`. **Risk:** `applyFieldRow` (`entry-store.ts:944`) writes whole Fields today; a per-Segment row needs a second apply path.

**S2 — the handle pair (about 1 hour).** `projectAffordances` with a two-Segment Entry, `can('resize')` false for one Segment. Decide between the two rules and record which: **(A)** the pair follows one Item; **(B)** the pair keeps bracketing the selection envelope (#200), and each handle is gated by the Item it lands on. **Recommendation: B**, expressed as `resizeHandles: { start?: ItemId; end?: ItemId }` replacing `resizableEntryId` + `resizableEdges`. A handle that is absent is not painted; nothing else says "no handle".

**S3 — the plain bar's id (about 2 hours).** Put the minted id in a store index and `segments: []` on a plain Entry. Then: select the bar, drag it, undo, assert the Selection still holds the same id. `removeSegments([thatId])` un-dates. The Rollup gives a childless-until-now parent dates and the id appears. **Risk:** 59 non-test `segments` readers and one `layout/` port. If the id cannot stay stable across undo without a ChangeSet row, stop and file a **Q** — the fallback is a stored record filtered on read, which the issue calls out as the thing to avoid.

---

## Build order

Each build lands as one change with `verify:full PASS`. Change the order only with a stated reason.

```
S1 S2 S3  →  B1  →  B2  →  B3  →  B4  →  B5  →  B6  →  B7
```

| Build | Job | Lands after | Gate |
|---|---|---|---|
| **B1** Segment data | `StoredSegment`/`Segment` pair, `name?` everywhere, Segment props at ingest, `toSegment` keeps data, `toInput()` copies | spikes | ingest tests; copy test creates new Segment ids; grid shows empty name cell |
| **B2** The plain bar | `segments: []` for plain, minted id in the index, Rollup writes dates, reconcile, draft, `moveEntryTo`, `removeSegments`, Selection drop rule, `LayoutInput` port. **`EmptySegmentsError` retires (Q1).** | B1 | S3's assertions as real tests; every `segments` reader in the table above re-read once |
| **B3** One write per Segment | `updateSegment`, `addSegment`, `FieldUpdated.segmentId`, per-Segment apply/replay, undo, `EditExtender` sees the address, `WriteRule` third argument, `transaction` batching test | B2 | S1's assertions as real tests; `addSegment` refuses a duplicate id like `add` does, and appends a structural `segments` row (J-plan-3) |
| **B4** Variants per Item | `whenSegment`, predicate `(entry, segment)`, two-phase resolve, frame carries the winner per bar, `resolveBarRenderer(item)`, `BarRendererContext.segment`, `DoubleVariantClaim` names the Segment, `UnknownFieldMatch` for `whenSegment` | B3 | every shipped rule claims the same Items as before (snapshot); `whenSegment: { hours: 8 }` claims exactly those Items |
| **B5** Capabilities per Item | `CapabilityRule(entry, segment)`, `can()` takes the Segment, `canGesture(item)` at every caller, handles per Item (S2's rule), grid-row click selects only Items that allow select | B4 | `e2e/write-refusal.spec.ts` locked Segment; a11y and keyboard paths ask the same `can` |
| **B6** Labels | `BarLabels` long form, `EntryVariant.barLabels`, label resolved in layout from the Item's source through `formatValue(…, segment)`, a11y label from printed text or dates, empty-label geometry test, day/week/year zoom test | B4 | the two pinned tests; a plain bar still prints `entry.name` |
| **B7** Harness, glossary, docs | one segmented row with per-Segment text, colour and capabilities; one plain bar with no name; `CONTEXT.md` Segment/Item entries; `docs/` consumer page; close #421 | B5, B6 | `harness/main.ts` reviewed; acceptance list in #421 all ticked |

**Why this order.** B2 before B3: a hidden id has no record, so `updateSegment` on it is impossible by construction, not by a check. B4 before B5: `can` per Item reads the Item-phase winner. B6 after B4: a per-variant label reads the same winner.

**What the spikes added to three builds.** Each line is measured, not predicted. Read `SPIKE-FINDINGS.md` for the evidence.

- **B2.** The Rollup mints and stores its own `segments` array row at `data/rollup.ts:180-189`, on a path that never calls `toSegments` or `reconcileEnvelope`. It gets the *same* `#syncPlainBarSegment` treatment, not a variant of it. `reconcileEnvelope`'s sole-Segment mirror (`entry-reader.ts:320-343`) narrows to fire only when a Segment already exists — S3 found that mirror is today's filtered-record trick, and removing it is what makes a plain drag keep the Entry plain. Expect wide test breakage: the `data/`-layer change **alone** broke 37 tests in 8 files, 20 of them in `api/gantt.test.ts`. Those are deep end-to-end paths over the readers the table names, not readers the table missed.
- **B3.** The second apply path is three pieces: `FieldUpdated.segmentId?: SegmentId` (`model/change-set.ts:20-25`), a segment-scoped diff beside `diffEdit` (`data/change-set.ts:53-73`) that reads `segment.read(field)`, and one branch in `#applyUpdatedRows` (`data/entry-store.ts:937-946`) keyed on `row.segmentId !== undefined`. `invertChangeSet` (`:150-156`) already swaps `from`/`to` per row, so undo and replay need nothing. **B3 also opens a second door, ruled as Q5.** `EditRequest.proposed` is `Map<EntryId, ProposedEdit>` (`model/stored-entry.ts:199,219`), and `ProposedEdit` widens `StoredEntry`, so its `segments` is a whole array. A consumer of the committed `ChangeSet` sees `segmentId` once the rows carry it, but an `EditExtender` cannot *propose* a one-field Segment edit. It must, or a cascade writes a whole-array row into a transaction whose other rows name Segments, and undo restores the array over them. **`SegmentEdits` is its own top-level collection** — `ReadonlyMap<SegmentId, SegmentEdit>`, beside `EntryEdits`, never a key inside an `EntryEdit`. A `SegmentId` is already a complete address (`entryIdOfSegment`, `data/entry-store.ts:463`), and every public Segment door keys that way, so nesting would make a plugin author supply what the store holds. **Q6 is open, and the author reserved it for a grill:** whether these stay two write doors or become one. Do not settle it inside a build. **Q4 is ruled:** `updateSegment` still writes the Entry's own envelope row, and its value is `envelopeOfSegments` over the row's Segments after the edit. B3 adds no new maths.
- **B5.** S2 confirmed rule B ships already: `resolveResizableEntry` (`view/affordance-projection.ts:86-114`) brackets the Entry's envelope and `resolveEdges` (`:72-79`) asks the two edges independently. Two real gaps remain. First, `Capabilities.can` (`view/capability.ts:34-36`) and `#canGesture` (`view/gantt-shell.ts:1838-1841`) take `(capability, entry, edge?)` — `edge` is an abstract distinction on the Entry, never "the bar at this edge". Second, hover narrows which Entry's pair shows but does not thread the hovered Item in, so hovering `d1` and hovering `d2` give identical `resizableEdges` today. Close both by resolving `start`/`end` from the row's first and last `ItemId` through `itemIdsForEntry`. The edge-to-Item mapping is structural, so hover does not decide which rule answers.

**Wide mechanical changes.** B1's `name?` touches every `entry.name` read. Let `pnpm typecheck` list them. Do not add `?? ''` at a read site that should print nothing; add it only where a `string` is required by a DOM API.

---

## Decisions this plan makes

Reversible. Each is a **J** in the log when a build takes it.

- **J-plan-1.** The plain bar's id lives in a store index, never in a record or a ChangeSet row.
- **J-plan-2.** `segmentIdsDroppedBy` goes. The Selection keeps an id while the store resolves it.
- **J-plan-3.** A `segments` row stays for **structural** writes (which Segments exist, in what order). A `segmentId` row is a **value** write on one Segment. Two questions, two rows.
- **J-plan-4.** `moveEntryTo` returns `{ start, end }` for a plain Entry. D-S5-50's reason (an envelope write overwrites a plugin's `end`) does not apply when there is no Segment to move.
- **J-plan-5.** A variant's `barLabels` merges over the Gantt's key by key: `{ field }` alone keeps the Gantt's placement.
- **J-plan-6. REVERSED 2026-09-16 (Q7).** ~~The live `Segment` exposes `read(key)` and `toInput()`, no `props`, no `entry()`. A navigation door would invite a read across.~~ The live `Segment` exposes `read(key)`, `toInput()` and `entry()`, and no `props`. The read rule (hard rule 3) already stops a fallthrough. Without `entry()`, a consumer who wants the row's name in a bar tooltip builds a `SegmentId → EntryId` map that the store already holds (`entryIdOfSegment`) — the stop rule's smell.
- **J-plan-8.** `addSegment` ships in B3 (Q3, ruled 2026-09-16). It appends through `toSegment`, writes one structural `segments` row, and returns the live `Segment`. The positional `update(id, { segments })` stays the door for reorder and replace.
- **J-plan-7.** Internal `Capabilities.can(capability, entry, segment, edge?)` takes `segment: Segment | undefined` as a required positional, so no caller can forget it. Run the naming skill on the object alternative before B5 and log the choice.

---

## User stories

Each story is one acceptance test. The consumer brief is `plans/handoff/2026-09-15-crm-filament-labor.md` §3.

1. **A crew lead sees one bar per day.** A labour request spans two weeks. Each day is a Segment with `hours`, `worker` and `filled`. The row shows one bar per day, each with its own text and colour. A weekend gap draws nothing.
2. **A filled day looks different from an open one.** `{ name: 'filled', whenSegment: { filled: true }, css }`. No renderer, no side map. The rule claims exactly the filled Items.
3. **A locked day cannot be resized, its neighbours can.** `interactions: { resize: (entry, segment) => segment?.read('locked') !== true }`. The locked bar shows no handle. The bar beside it shows both. Dragging the locked edge does nothing.
4. **A dispatcher assigns one worker to ten days in one step.** Ten `updateSegment` calls inside one `transaction`. One ChangeSet, ten rows each naming its `segmentId`. One undo clears all ten.
5. **A planner copies a request.** `entries.add({ ...entry.toInput(), id: 'copy' })`. The copy has every day's data and fresh Segment ids. Nothing throws.
6. **A booking with no title is still a bar.** `{ id: 'hold', start, end }`. The grid's name cell is empty. The bar draws, hovers, selects and resizes like any other. A screen reader hears the dates.
7. **A bar prints hours, not its name.** `bar({ barLabels: { field: 'hours' } })`. The bar reads `8 h` through the Field's `formatValue`, the same text the grid would show. At year zoom it is a sliver and still reads `8 h` on hover.
8. **A lead adds a day to a request.** `entries.addSegment('req-1', { start, end, hours: 8 })`. One new bar appears on the row. The other bars keep their ids, so the Selection is unchanged. Undo removes the bar and its data.
9. **A drag keeps the data.** The lead drags a day one column right. The bar moves. Its `worker`, `hours` and `filled` are unchanged. Undo moves it back and the Selection still holds it.

---

## Files a build touches most

| Area | Files |
|---|---|
| model | `model/stored-entry.ts`, `model/segment.ts` (new), `model/change-set.ts`, `model/interactions.ts`, `model/field.ts:230`, `model/dataset.ts:64-69` |
| data | `data/entry-reader.ts`, `data/entry-store.ts`, `data/rollup.ts`, `data/live-entry.ts`, `data/live-segment.ts` (new), `data/change-set.ts`, `data/replay.ts`, `data/dataset-state.ts:298` |
| layout | `layout/items/variants.ts:82-111,444-530`, `layout/items/item.ts:93-110,180`, `layout/items/produce-items.ts`, `layout/frame.ts:136-156,271,353`, `layout/frame-memory.ts:110-160`, `layout/gesture-draft.ts`, `layout/renderer.ts:29-36,94` |
| view | `view/gantt-shell.ts:716,875,900,929,1352,1838`, `view/affordance-projection.ts`, `view/capability.ts:36,216`, `view/segment-selection.ts:121-140` |
| render | `render/dom/index.ts:201-260` (label and handle paint) |
| consumer | `harness/main.ts`, `fixtures/demo-dataset.ts`, `CONTEXT.md:67-73,212-214`, `e2e/selection.spec.ts`, `e2e/write-refusal.spec.ts` |
