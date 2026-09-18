# A Segment is a bar — build log (#421)

**Q** is a question for the author. It waits. **J** is a call an agent made alone, so a reviewer can find it and reverse it.

Write the entry the moment it comes up, not at the end. Check that one does not already exist before you open a second.

**Status, 2026-09-17. Q17 is RULED: a bar is a regular child Entry.** The Segment retires, and with it Option C. **Q1–Q16 are void as shapes** — each one ruled a detail of a type this library will not ship. Their text stays as the record of what was refused and why. The build order is C1–C7 in [`README.md`](README.md); B1–B8 do not exist.

**Read this table, not the old bodies.** An entry marked *Void* or *Superseded* keeps its text as the record. Its job may survive. Its shape does not.

| | Question | Status |
|---|---|---|
| Q1 *(void)* | does `update(id, { segments: [] })` make an Entry plain? | **Ruled**, then corrected — it leaves the row dateless. Q11(e): a plain bar from a segmented row is two calls in one transaction |
| Q2 *(void)* | what does removing the last authored Segment leave? | **Ruled** — it un-dates the Entry, and the row stays |
| Q3 *(void)* | does `addSegment` ship beside `updateSegment`? | **Ruled yes; Q13 confirms the name** after Q10 briefly moved it to `dataset.segments.add` |
| Q4 *(void)* | does `updateSegment` write the Entry's envelope row? | **Superseded in mechanism by Q8/Q9.** A Segment write re-runs the Rollup, which writes the row's `start`/`end` rows in the same transaction |
| Q5 *(void)* | can an `EditExtender` propose a one-Segment edit? | **Ruled yes.** `SegmentEdit`/`SegmentEdits` keep their names; Q11(c) puts them inside `DatasetEdits` |
| Q6 *(void)* | is there one write door, or two? | **Ruled 2026-09-17: Option C.** Every bar is a Segment; Q10–Q14 fix the shape |
| Q7 *(void)* | does an Entry read across to its Segments, or a Segment to its Entry? | **Ruled** — `read(key)` never falls through. Navigation (`segment.entry()`) ships. J-plan-6 is reversed |
| Q8 *(void)* | can an Aggregator run over Segments? | **Ruled** — yes, onto the row's cell, never onto a bar. Segments and children union, no knob |
| Q9 *(void)* | is the envelope the Rollup over Segments? | **Ruled 2026-09-17: yes.** `start`/`end` roll up from Segments to the row through the normal Aggregators (`min`, `max`). The four hand-written paths retire |
| Q10 *(void)* | under C: the bar's name, where writes go, what backs a plain bar, a write to a segmented row's dates | **Ruled 2026-09-17** — `Segment`; the Entry backs a plain bar; the rolling-up parent's rule. **Answer 2 (`dataset.segments`) is superseded by Q13** |
| Q11 *(void)* | the Option C details Q10 does not answer | **Ruled 2026-09-17** — (a) one `EntryVariant` + `whenSegment`; (b) `edit` stays the cell rule, `formatValue(value, ctx, owner)`; (c) `DatasetEdits`; (d) `BarRendererContext.segments`; (e) derivation read before the patch, `#derives` |
| Q12 *(void)* | how does `update(id, { segments })` treat the array? | **Ruled 2026-09-17** — replaces the list; each element replaces its Segment; match by `id` only; positional match retires |
| Q13 *(void)* | `updateSegment`, or `dataset.segments.update`? | **Ruled 2026-09-17** — `entries.updateSegment` / `addSegment` / `removeSegments`. No second collection |
| Q14 *(void)* | should every spanning row store a Segment? | **Ruled 2026-09-17: no.** Q10's storage stays. Every bar is still a Segment to the consumer |
| Q15 *(void)* | which ChangeSet rows do structural Segment writes make, and how do they sit beside value rows? | **Ruled 2026-09-17** — one row per Segment added, removed or changed; only `update(id, { segments })` writes a whole-array row, and the refusal applies to that call alone |
| Q16 *(void)* | what does `removeSegments` do to a derived row's minted id? | **Ruled 2026-09-17** — refused with `DerivedFieldNotWritableError` |
| Q17 | is a bar a regular child Entry, drawn on its parent's row by a row source rule? | **RULED 2026-09-17: yes.** Spike S4 measured the cost objection away. The Segment retires, Option C is void, and Q1–Q16 go with it |
| Q18 | is the rule Gantt-wide or per Entry, and does it need `tree`? | **RULED with Q17, 2026-09-17** — both, through one key; `tree` is orthogonal and leaves the two-level call site |
| Q19 | where does a claimed row name its own Entry, and where does the parent's Item suppression live? | **RULED 2026-09-17: shape (a).** `entryIds[0]` stays the subject; `PlannedRow` carries the claimed marker. Shape (b) was written and breaks nine call sites with no compile error. C2 builds the rail seam; C3 fixes the nine sites — seven read a row's list, two read the Selection's |
| Q20 | can a row filter hide one bar on a shared row? | **RULED 2026-09-17 by the author: it does not need to.** A filter hides a parent, and its segments go with it, because they sit on the parent's row. `applyFilter` already does exactly this, so nothing ships and no item-level knob exists |
| Q21 | does the entries row source take the Field registry, so `childrenAsSegments` matches with typed `equals` and reports an unknown key? | **RULED 2026-09-17 by the author: yes, thread it.** C1 passes `fieldContext` into the entries-source pass, as `sort` already receives it, so a misspelt key reports once through `reportUnknownFieldMatch` instead of drawing a blank screen in silence. C1 rewrites `row-source.ts`'s own statement of D-S4-19/D-S4-21 |
| Q22 | does core ship a `boolean` Field type? | **RULED 2026-09-17 by the author: yes.** It lands in C1 with ingest, `formatValue`, `parseValue`, `compare` and `equals`, because the rule's own examples are its first consumer. Today `{ type: 'boolean' }` throws `UnknownFieldTypeError` (`data/fields/field-registry.ts:70`) |
| Q23 | does a hierarchy source declare the Field keys it reads? | **RULED 2026-09-17 by the author: decide it later, on its own evidence.** Split out as **#426**. C4 ships the fast path for core's own `storedParentSource` alone, gated on `tree.source === storedParentSource`; a consumer's own source keeps today's behaviour, which is correct and slower |
| J1 *(void)* | S1's ChangeSet address | **Void with Q17** — a bar writes no Segment row. The measurement stands as a record; its subject does not |
| J2–J3 *(void)* | S2 and S3 findings | **Void with Q17.** S1–S3's own text was removed from `SPIKE-FINDINGS.md` on the author's word, so the bodies below are the only record left |
| Q24 | what is the key called? | **RULED 2026-09-17 by the author: `childrenAsSegments`.** It frees the word *Segment* from the type that retires in C6. `README.md` holds the reasoning, the rejected names, and the one cost — the word means two things between C1 and C6 |
| Q25 | what is `measureDuration: 'segments'` called now, and what do two overlapping children count as? | **RULED 2026-09-17 by the author: `measureDuration: 'children'`, and overlap has no rule of its own — the number is whatever the Aggregator says.** Core adds the children and never reads them for overlap. C6 renames the member |
| Q26 | how does a claimed parent ask for a rail instead of a bar? | **RULED 2026-09-17 by the author: it draws no bar of its own, and core ships nothing else.** A consumer variant with an explicit `items` producer still wins, as it does today. No new key, no rail concept, no special case |
| Q27 | a claimed parent draws no bar — so how does core's own `summary()` not draw one? | **RULED 2026-09-17 by the author.** `produceItemsForRow` skips the row's subject when the row claims, and the producer seam takes **one** more fact, per Entry, carrying the key's own name: `childrenAsSegments`. Not two facts, and no `global` prefix — the two spellings of the key resolve in one place |
| Q28 | is the layout unit a `Bar`, not an `Item`? | **RULED 2026-09-17 by the author: yes, and in C6.** `Item` → `Bar`, `ItemId` → `BarId`, `ItemProducer` → `BarProducer`, and the rest of the table below. `MenuItem` and `CellItem` keep the generic word |
| J4 | S4 — a bar is a child Entry | **The ruling.** Cost measured, shape (a) chosen, nine open points closed as `J-plan-A`…`J-plan-I` in [`README.md`](README.md). Q8, Q10 and Q11 of the spike were not reached; C1 and C3 cover them as real tests, not probes |

**Entries that record a reversed call.** Q1's first ruling was wrong, and Q11(e) corrected its plain-bar call site. Q5's first shape was wrong, and Q11(c) wraps its maps in `DatasetEdits`. Q9 replaced Q4's envelope pass, and Q4's naming trap with it. Q7 reverses the plan's first hard rule 3 and J-plan-6. Q8 reverses "no Aggregator over Segments". Q10 answer 2 (`dataset.segments`) was reversed by Q13, so Q3 stands. The Q6 grill's sketch was refined by Q10–Q13. Each keeps the rejected text, so a reader sees what was refused and why. Read the correction, never the first answer.

---

## Q1 — does `update(id, { segments: [] })` make an Entry plain?

**Raised 2026-09-16, in the plan. B2. RULED the same day, then CORRECTED the same day. Read the correction — the first ruling was wrong.**

Today it throws `EmptySegmentsError` (`data/entry-reader.ts:607`): under ADR 0012 a spanning Entry always held a Segment, so empty was illegal. Under #421 a spanning Entry with `segments: []` is the plain bar — the state every plain Entry stores.

**First ruling, wrong.** "`update(id, { segments: [] })` clears the authored Segments and keeps the Entry's dates, so the row draws one plain bar."

**The author refused it, and the code agrees with the author.** An Entry's dates are not stored beside its Segments. They **are** the Segments' envelope whenever Segments exist: `toEntry` reads `segments.length > 0 ? envelopeOfSegments(segments) : dates` (`entry-reader.ts:222`), and `reconcileEnvelope` recomputes the same value at `:355`. So clearing the Segments removes the only source those dates had. Keeping them would keep a stale span — the exact bug #212 finding 4 fixed, written down in `toEntry`'s own doc comment (`entry-reader.ts:205-211`).

**The corrected ruling.** `update(id, { segments: [] })` is **legal** and leaves the row **dateless** ~~, unless the same edit names `start` and `end`~~ (that clause is corrected by Q11(e): a plain bar from a segmented row is two calls in one transaction). `EmptySegmentsError` retires, because empty is no longer illegal. It is simply not a span.

**Why the error's own reason died.** It had one: ADR 0012's biconditional, *an Entry holds at least one Segment if and only if it spans* (`docs/adr/0012-dates-are-optional-on-every-kind.md`, §Consequences). #421 retires that rule, because a plain bar stores dates and `segments: []`. The reason goes with the rule.

**How a consumer makes a plain bar from a segmented row:** ~~`update(id, { segments: [], start, end })`~~. **Corrected by Q11(e), 2026-09-17:** derivation is read before the patch, so that one call throws on `start`. Write two calls in one transaction, one undo: `dataset.transaction(() => { entries.update(id, { segments: [] }); entries.update(id, { start, end }); })`. `update(id, { segments: [] })` alone still leaves the row dateless.

**Two dating rules, one sentence each.** *Restated by Q9 and Q11(e):* a row that does not derive keeps the dates it named, read straight (ADR 0012). A row that derives — it has children or authored Segments — rolls `start`/`end` up through `min`/`max`, and a new ADR revises ADR 0013 to say so. The original sentence said "#421 does not change it"; the mechanism did change.

**What B2 must change.**
- `EmptySegmentsError` retires — `src/model/errors.ts:370`, the throw at `src/data/entry-reader.ts:607`, and the two public re-exports (`src/model/index.ts:100`, `src/api/index.ts:246`).
- **Moot since Q9:** `envelopeOfSegments` retires into the Rollup, so its message goes with it. The original note: `envelopeOfSegments` throws on an empty array with a message naming the retired invariant — *"every stored Entry keeps at least one"* (`src/time/instant.ts:59`). The guard at `entry-reader.ts:222` keeps the call from reaching it, so the throw stays; the message must stop citing a dead rule.
- ADR 0012 needs a revision note. The biconditional is dead, and ADR 0006's rule applies: the new ADR carries the revision, and 0012 is not edited in place.
- `plans/02-public-api.md:120` and `:230` state the retired rule twice.
- Two tests assert the throw, one by name: `src/data/entry-reader.test.ts:245` and `src/data/entry-store.mutation.test.ts:123` ("ADR 0012 Gate").

---

## Q2 — what does removing the last authored Segment leave?

**Raised 2026-09-16, in the plan. B2. RULED the same day: it un-dates the Entry, and the dateless row stays in the grid. Today's rule holds, unchanged.** The door stays `dataset.entries.removeSegments` (Q13).

Today `removeSegments` on the last Segment un-dates the Entry (`CONTEXT.md:67`, ADR 0012's *last-segment-remove un-dates both dates*). Under #421 the dates are what make a bar, and the Segments are pieces of it.

**The ruling.** Removing the last authored Segment un-dates the Entry. The row keeps its place in the grid with empty date cells. `entries.remove(id)` is still the call that deletes a row. Two intents, two calls (ADR 0012).

**Why, in one line.** The dates of a segmented Entry **are** their envelope (`entry-reader.ts:222`). Remove the last Segment and the envelope has no source, so the dates go with it. Nothing is derived from nothing.

**Q1 and Q2 now agree, and the plan's earlier worry is void.** The plan warned that two doors could reach `segments: []` and disagree about the dates. They do not. `update(id, { segments: [] })` and `removeSegments(lastId)` both leave the row dateless, because both remove the same source. A caller that wants a plain bar writes two calls in one transaction: clear the Segments, then name the dates (Q11(e)).

**What B2 must change.** `#removeSegmentsFrom` (`data/entry-store.ts:720`) already takes the un-date branch when nothing remains, and S3 measured it working for a plain bar with **no code change**. The one addition is the plain bar's own id: `removeSegments([plainBarId])` un-dates, because that id names the whole bar.

---

## Q3 — does `entries.addSegment(entryId, input)` ship beside `updateSegment`?

**Stands, 2026-09-17 (Q13).** Q10 briefly moved this door to `dataset.segments.add`. Q13 moved it back: `addSegment` ships on `dataset.entries`, as ruled below.

**Raised 2026-09-16, in the plan. RULED the same day: yes, it ships** — in B4 of the current build order (it was B3 before the 2026-09-17 reorder). The first recommendation was "not in this issue", on scope alone. The author asked why, and the scope reason did not hold. It stands here as the record.

#421 names `updateSegment` and keeps the positional `update(id, { segments })` as the structural door. Adding one day to a request then reads `update(id, { segments: [...entry.segments.map((s) => s.toInput()), { start, end }] })`.

**Why it ships now.**
- The positional form makes the consumer rebuild the array to add one piece. That is the consumer re-deriving what the store holds, which is the stop rule's smell. B7's "add a day" story would log it as an API gap mid-build.
- The positional door is fragile for this job. `toInput()` omits Segment ids, so the write keeps ids by index. Append works. A reorder swaps ids under the Selection.
- `removeSegments` exists and `updateSegment` ships in B3. Remove and change with no add is a lopsided surface.
- The labour brief adds days to a request as a first-class action.

**Shape.** `entries.addSegment(entryId, input): Segment`. Singular, like `updateSegment`. Reads through `toSegment`, mints or takes the id, refuses a duplicate id as `add` does, writes one structural row (J-plan-3), returns the live `Segment`. On a plain Entry it drops the plain bar's id and the new Segment's id names the bar. (Once J-plan-8 in the README; the README now states it in the API table and J-plan-3.)

---

## J1 — S1's ChangeSet address: no `segmentId` row today, and a second write path is real but small

**Ruled 2026-09-16, from the S1 spike. Void with Q17, 2026-09-17 — record only.** S1's own text is no longer in `SPIKE-FINDINGS.md`; the author had it removed, and this entry is what is left of it. **Shape superseded 2026-09-17 by Q6:** there is no `FieldUpdated.segmentId`. A Segment write is a `store: 'segments'` row keyed by the Segment's own id. The measurement below stands: the apply path is small, and undo needs no change.

Today's store cannot produce a `{ segmentId, field }` row at all: `FieldUpdated`
(`model/change-set.ts:20-25`) has no `segmentId` key, and `applyFieldRow` (`entry-store.ts:72-84`)
only writes a whole Field. A two-Segment `update('req-1', { segments: [...] })` produces one
whole-array `segments` row plus one Entry-level `end` envelope row — confirmed by a real committed
`ChangeSet`, not by reading the plan.

**The second apply path the named risk asked about is real, and it is small.** One field on
`FieldUpdated` (`segmentId?: SegmentId`), one segment-scoped diff function (mirrors `diffEdit`,
reads `Segment.read` instead of `readField`), one apply branch in `#applyUpdatedRows` keyed on
`row.segmentId !== undefined`. `invertChangeSet` needs no change — undo-by-id falls out of the row
already naming `segmentId`, so replay finds the Segment by id, never by array position. This
confirms the README's B3 sketch. It does not confirm the envelope-row detail — see Q4.

---

## J2 — S2's handle pair: rule B is already the production shape; the gap is per-Item gating, not the bracket rule

**Ruled 2026-09-16, from the S2 spike. Void with Q17, 2026-09-17 — record only.** S2's own text is no longer in `SPIKE-FINDINGS.md`; the author had it removed, and this entry is what is left of it. The per-Item gating it found is real and survives as C3. **Its build and shape moved 2026-09-17:** the work is now B6, and `Capabilities.can` takes the Segments a bar stands for (J-plan-7, Q11(d)), not a `segment?` parameter.

`projectAffordances`/`resolveResizableEntry` (`view/affordance-projection.ts`) already brackets the
Entry's envelope and already gates each edge independently — confirmed with the real, exported, pure
function, not a mock of it. Rule B stands: no reversal of the README's recommendation.

The gap is that `Capabilities.can`/`#canGesture` (`view/capability.ts:34-36`,
`view/gantt-shell.ts:1838-1841`) take `(capability, entry, edge?)` with no Segment or Item — `edge`
is an abstract start/end distinction on the Entry, not "the physical bar at this edge." Hover
narrows which Entry's pair shows but does not thread the hovered Item into edge resolution either
(`resolveResizableEntry`'s hovered branch still asks Entry-wide edges). B5 closes this by resolving
`start`/`end` from the row's first/last `ItemId` (`itemIdsForEntry`) and gating each through
`canGesture(item)` once `Capabilities.can` gains `segment?` — matching the README's
`resizeHandles: { start?: ItemId; end?: ItemId }` sketch. I14 holds because the same per-Item
`canGesture` call both decides the handle's presence and gates the resize gesture's own start —
one resolution, two readers, as today's `can()` doc comment already promises.

---

## J3 — S3's plain-bar id: stable across undo with no ChangeSet row, no blocking finding, and B2 is wide work

**Ruled 2026-09-16, from the S3 spike. Void with Q17, 2026-09-17 — record only.** S3's own text is no longer in `SPIKE-FINDINGS.md`; the author had it removed, and this entry is what is left of it. A bar id is an authored `EntryId` now, so the minted plain-bar id has no subject.

A real (reverted) throwaway change — `toSegments` returns `[]` for an unauthored spanning Entry,
`reconcileEnvelope`'s sole-Segment mirror only fires when a Segment already exists, and
`EntryStore` gains a private `#plainBarSegmentId` index synced on every commit — proved the id
stays stable across a drag and an `undo()`, and that `removeSegments([thatId])` already un-dates
with no further change. Undo needed no special-casing: the id is never in a ChangeSet row, so there
is nothing for undo to get wrong, the same way `LiveEntries` hands out one stable `Entry` per id.
No fallback to a stored, read-filtered record was needed — the opposite: the spike **removed** the
one place (`reconcileEnvelope`'s sole-Segment mirror) that was already doing that trick for the
drag/undo case today.

**Not covered by the index at all:** `data/rollup.ts:180-189` mints and writes its own `segments`
array row directly for a newly-dated parent, independent of `toSegments`/`reconcileEnvelope`. B2
must give it the same `#syncPlainBarSegment` treatment, not a variant of it — the README's table
already names this file and line correctly.

**The reader surface is wider than the table states.** Running the existing suite with only the
`data/`-layer changes applied (no `rollup.ts`, `layout/`, or `view/` edits) broke 37 tests in 8
files. Two of those files are exactly the README's cited `layout/frame.ts`/`frame-memory.ts` lines.
The other six include `api/gantt.test.ts` (20 of the 37 failures) — real drag, selection,
keyboard-nudge and Delete-key end-to-end tests.

**Correction, made by the coordinator the same day.** This entry first read those 20 failures as
proof that `view/`'s own Selection and gesture-preview code reads `entry.segments` directly. It does
not. `view/segment-selection.ts` holds its own `#segments: readonly SegmentId[]` (`:64`) and asks the
store through `entryIdsOfSegments` (`:84`) — those are its own field, not `entry.segments` reads.
`gesture-draft.ts` lives in `layout/`, not `view/`. A grep of `\.segments` across `src/view/**`
answers one non-test line: `gantt-shell.ts:2103`, which the README's table already names.

**What the 37 failures do prove.** The named readers sit under deep end-to-end paths, so one
`data/`-layer change breaks tests three layers up. That is a cost signal for B2's size, not evidence
of a reader the table missed. B2 still re-greps before it counts readers fixed, because the table was
measured at `d87cbdd` — but it starts from the table, which this check found accurate.

---

## Q4 — does `updateSegment` still write the Entry's own `end` envelope row?

**Mechanism superseded 2026-09-17 by Q9.** No envelope pass exists. The ruling holds: `updateSegment` re-runs the Rollup, which writes the row's `start`/`end` rows in the same transaction. The text below is the record.

**Raised 2026-09-16, from the S1 spike. RULED the same day: yes, it writes the row. The Entry's span is the Segments' envelope — the lowest `start` and the highest `end`.**

**The ruling, in the author's words:** "the row should be rolled up using min for start and max for end".

**This is what `envelopeOfSegments` already computes** (`src/time/instant.ts:56-68`): it walks the spans, keeps the lowest `start` and the highest `end`, and every write path calls it. So `updateSegment('d2', { end })` writes an Entry-level envelope row, and the value is that min/max over the row's Segments after the edit. B3 adds no new maths. It carries the existing envelope pass onto the new per-Segment write path.

**Retired by Q8 and Q9.** An Aggregator runs over Segments, and the envelope **is** the Rollup with `min`/`max`. The original text follows as the record.

**A naming trap, and B3 must not step in it.** The behaviour is a min/max fold, but **it is not the Rollup**. In this codebase the Rollup is the pass over an Entry's *children* (ADR 0013), and #421 states that no Aggregator ever runs over Segments. Same arithmetic, different pass, different inputs. Call this one the **envelope**, as `envelopeOfSegments` and `reconcileEnvelope` already do. One word covering both passes is the #7 *"chart"* failure a second time.

---

### The question as it was raised

**Answered by the ruling above. The wording below is kept as the record of what was asked.**

Today, an envelope-only edit on a **sole**-Segment Entry mirrors into both the Entry's own
`start`/`end` and that one Segment (`reconcileEnvelope`, `entry-reader.ts:320-343`) — one bar, one
pair of dates, told twice. Under #421 a row can hold several authored Segments, each with its own
`start`/`end`, and the Entry's own `start`/`end` is the union of all of them (confirmed by S1: moving
`d2`'s `end` also moved the Entry's own `end`).

**The question:** does `entries.updateSegment('d2', { end })` on a **multi**-Segment row still write
an Entry-level `end` envelope row (today's mirror, generalized to "union of Segments"), or does the
Entry's own `start`/`end` stay whatever it was last computed as, updated only by a later read (a
`compute`-like path) rather than a written row on every Segment edit?

**Recommendation:** keep writing it as a row — a grid column or a Rollup input that reads the
Entry's own `start`/`end` must not go stale between commits, and `rollUp`/`compute` are documented
as Entry-only (README, "Fields and keys"), so nothing else keeps that value current on every commit.
This is a small yes/no, not a design question, but it is not this plan's call to make silently: it
changes what one `updateSegment` call writes to the ChangeSet, which #421's acceptance list checks
against ("The ChangeSet row names the `segmentId`, and undo replays it" — plural rows, if the
envelope mirror stays).

## Q5 — can an `EditExtender` propose a one-Segment edit?

**Holds, 2026-09-17, with one change (Q11(c)).** An `EditExtender` proposes a one-Segment edit, and `SegmentEdit`/`SegmentEdits` keep their names. The extender now returns `DatasetEdits = { entries?, segments? }` in place of two loose maps. The row is `store: 'segments'`, not `segmentId`. The text below is the record.

**Raised 2026-09-16, from the S1 spike, as "not settled". RULED the same day: yes, it must. The shape was then CORRECTED the same day — read the correction.**

**The ruling, in the author's words:** "it needs to be able to propose a segment update if we want undo states to work and for it to be consistent with everything else".

**Why undo forces it.** `data/`'s rule is that undo records user edits and engine cascades **atomically**. A cascade that can only propose a whole `segments` array writes a whole-array ChangeSet row. Undo then restores the whole array. That loses the per-Segment address the same transaction just gained on the user's own row, and it overwrites values the cascade never meant to touch. One transaction would carry two row shapes for one job.

**Why consistency forces it.** `plans/02`: extra field writes use the same object the write door takes, and illegal combinations are unrepresentable. A surface where the app author writes one Segment by id, and the plugin author can only rewrite the array, is two shapes for one job.

### The shape, first answer — wrong

"The extender proposes a `SegmentEdit` keyed by `SegmentId`, riding on the owner Entry's edit. `EntryEdit` gains a `segmentEdits` key, so `EditRequest.proposed` stays `Map<EntryId, ProposedEdit>`."

### The shape, corrected

**The author asked why a Segment edit sits under an Entry when the `SegmentId` is already the address. It should not.**

A `SegmentId` is a complete address on its own. Two Segments never share one, on the same Entry or across two Entries (`CONTEXT.md`, *Segment*). The store resolves the owner from the id alone through `entryIdOfSegment` (`data/entry-store.ts:463`), backed by a `SegmentId → EntryId` index (`:169`). Every public Segment door already keys this way: `removeSegments(ids)` takes ids only (`model/dataset.ts:69`) and crosses several Entries in one transaction, and `updateSegment(segmentId, edit)` names no Entry.

**Nesting would make a plugin author supply what the store already holds.** That is the stop rule's smell. A cascade over ten Segments on three Entries would have to bucket them by owner before writing. Core does that, and already does.

- **`SegmentEdits` is its own top-level collection:** `ReadonlyMap<SegmentId, SegmentEdit>`, beside `EntryEdits`, never inside an `EntryEdit`.
- **`EntryEdit` gains no key.** One fewer knob. The app-author door stays `entries.updateSegment('d2', { hours: 4 })`, which names no Entry because none is needed.
- **`SegmentEdit` is the write shape for one Segment** — `name`, `start`, `end` and props keys, the object `updateSegment` takes. It mirrors `EntryEdit` exactly.
- Each proposed `SegmentEdit` becomes one `segmentId`-addressed ChangeSet row (J-plan-3), so undo inverts it per Segment, beside the user's own rows.
- Core still recomputes the owner's envelope. It resolves the owner itself, so the edit never states one (Q4).

**What this costs.** `EditExtender` is `(request: EditRequest) => EntryEdits` today (`CONTEXT.md`, *EditExtender*). It would return two maps instead of one. #209 hardened the rule that *a plugin author names no other type to write a cascade — the hook writes exactly what `update()` takes*. Under #421 `update()` is no longer the only write door, because `updateSegment()` is one too. So the rule generalizes: the hook writes exactly what the public doors take, keyed the way those doors key them. It does not break.

**The one refusal this adds.** One transaction that names the whole `segments` array for an Entry **and** a value edit for a Segment inside it says two things about one Segment. Refuse it, the way `SegmentsOutOfSyncError` refuses an envelope that disagrees with its Segments. Structural and value writes stay two questions, never two answers to one.

**Names settled by the naming skill, 2026-09-16.** `SegmentEdit` and `SegmentEdits`, mirroring `EntryEdit`/`EntryEdits`. Rejected: `segmentPatch` (*Patch* is under **Avoid** in `CONTEXT.md`, and `*Patch` is barred from the app-author surface), `segmentWrites` (*Edit* is already the glossary's word for a write shape), `bySegment` (names the key, never the payload). **One cleanup:** a grep for `SegmentEdit` answers 14 hits today, all of them the local test helper `singleSegmentEdit` in `layout/gesture-draft.test.ts`. Rename it with `pk-rename-symbol` in B3 so the grep shows the concept.

**Scope.** B3, beside `updateSegment` and `FieldUpdated.segmentId`. It is new plugin-author surface, so `plans/02` gains it and the spec's Writes section names it.

---

## Q6 — is there one write door, or two?

**Raised 2026-09-16, out of Q5's correction. B3. RULED: Option C, one door.** The author took C in the 2026-09-16 grill, and said so plainly on 2026-09-17. Read "The grill" below the original question.

Q5 leaves an `EditExtender` returning two collections: `EntryEdits` keyed by `EntryId`, and `SegmentEdits` keyed by `SegmentId`. The public surface has the matching pair, `entries.update(id, edit)` and `entries.updateSegment(segmentId, edit)`.

**The question:** should these be one door or two? Two shapes for two addressable things is honest, and it is what the store already does. One door that takes either address is fewer names for an author to learn. Nothing is decided.

**What a grill must weigh.**
- `EntryEdits` and `SegmentEdits` are the same map shape over two id brands. A single door keyed by a union address is representable, and `plans/02` warns that illegal combinations should be unrepresentable — a union key makes every read narrow first.
- The extender's return type needs a name if it stays two maps. The working recommendation is `DatasetEdits`, the edits a transaction applies to the Dataset. `Edits` alone fails the search test. `CascadeEdits` claims every extender write is a cascade, which is not true.
- #209's rule is the constraint to argue against: a plugin author names no other type to write a cascade.
- Whatever wins must keep the per-Segment ChangeSet row (Q5) and the envelope recompute (Q4).

**Do not settle this inside a build.** It changes the plugin-author surface, so it is an API decision, not an implementation one.

### The grill, 2026-09-16 — Option C, ruled

**Status: ruled.** The author took C in the grill, and confirmed it on 2026-09-17. **Q10–Q13 changed six details of the sketch below.** Sixth: the sketch says C needs "no second apply path, no second Edits collection"; B4 builds both — a `store: 'segments'` apply branch, and `SegmentEdits` inside `DatasetEdits` (Q11(c)). The other five: the name is `Segment`, not `pieces` (Q10); the write doors are `entries.updateSegment`/`addSegment`/`removeSegments`, not one collection's `get`/`add`/`update`/`remove` (Q13); navigation is `segment.entry()`, not `row` (Q10); variants stay one `EntryVariant` with `whenSegment`, not two lists (Q11(a)); and the extender returns `DatasetEdits` (Q11(c)). Read Q10 for the shape, and this section for the reasons.

**The finding.** One id space already exists. `entryIdOfSegment`, `segmentIdsOfEntries` and the Selection answer for a plain bar and an authored Segment from one id. Core treats every bar as one addressable thing. The consumer gets two of everything:

| Job | Entry door | Segment door |
|---|---|---|
| read a value | `entry.read(k)` | `segment.read(k)` |
| write a value | `entries.update(id, e)` | `entries.updateSegment(id, e)` |
| add one | `entries.add(i)` | `entries.addSegment(eid, i)` |
| remove | `entries.remove(ids)` | `entries.removeSegments(ids)` |
| match | `when` | `whenSegment` |
| gate | `(entry)` | `(entry, segment?)` |
| propose an edit | `EntryEdits` | `SegmentEdits` |
| address a row | `{ id, field }` | `{ id, segmentId, field }` |

The worst part is the optional. Every seam under #421 receives `segment?: Segment | undefined`. That optional is the consumer tracking "a Segment or a bar" in the type system, at every seam.

**Core already knows the answer, and hands out the question.** The issue states the rule: an Item reads the Segment it draws, and an Item that draws no authored Segment reads its Entry. Core runs that rule once, in the layout pass. Then it hands the consumer a pair, and the consumer runs the rule again. That is re-derivation at the seam.

**Option C — one door, two backings.** The consumer's unit is the dated piece.
- One id. Every bar has one, plain or authored.
- One live type. It answers `id`, `start`, `end`, `name?`, `read(key)`, `row` (the owning Entry, for grid and hierarchy questions) and `toInput()`.
- One collection: `get`, `add`, `update`, `remove`. `updateSegment`, `addSegment` and `removeSegments` never ship.
- `entry.pieces` is never empty for a spanning row. A plain row answers one. A segmented row answers many.
- Every seam takes one object, not a pair: `when(piece)`, `can(piece, cap)`, `paint({ piece, item })`, `formatValue(v, ctx, piece)`.
- Two phases, two rule lists. The row phase decides `items`. The bar phase decides `paint`, `css`, `can` and `barLabels`. Today one `EntryVariant` holds `items` (row only) beside `whenSegment` (bar only), so an illegal combination is representable. Two lists make it unrepresentable.
- Storage keeps the `segments` array. "Segment" becomes a storage word that the consumer never types.
- Q5 and Q6 dissolve. One id space gives one ChangeSet row shape `{ id, field, from, to }`. No `segmentId`, no second apply path, no second Edits collection, no `segmentIdsDroppedBy`.

**Option B — a piece is a child Entry. Live alternative, not taken.** Core already owns the child index, depth, the descendant walk and the Rollup. Whether children draw as sub-rows or as bars on the parent's row becomes a variant decision.
- B deletes: `StoredSegment`/`Segment`, `SegmentId`, `SegmentInput`, `SegmentNotFoundError`, `EmptySegmentsError`, `SegmentsOutOfSyncError`, the minted plain-bar id, the `LayoutInput` port, and the envelope/Rollup split.
- B costs: (1) perf — 10,000 day pieces become 10,000 Entries in the hierarchy, the row list and the Rollup. This is the decisive objection. (2) The grid and the timeline must share one row list, driven by the same variant decision. (3) The default inverts: children draw as their own rows, so the crew-lead story needs a variant.
- B's strongest argument was the rollup hole. Q8 closes that hole under C, so C wins more clearly.

**Naming is not solved.** `bars` names the picture, but a variant can draw zero or two bars for one piece (`ignoreSegments`, `fixedWidthItem`). `spans` collides with `TimeSpan`. `pieces` is a placeholder. Run the naming skill before C lands.

---

## Q7 — does an Entry read across to its Segments, or a Segment to its Entry?

**Raised 2026-09-16, in the Q6 grill. RULED the same day. Reverses the plan's hard rule 3 ("Nothing reads across") and J-plan-6.**

**Where the old rule came from.** Nowhere. A grep of the whole repo finds "reads across" only in this folder's README and in the #421 text. No ADR, no `plans/01`, no `CONTEXT.md` states it. The design already broke it: an Entry's `start`/`end` is its Segments' envelope (`data/entry-reader.ts:222`).

**The ruling.** Keep the narrow rule. Drop the rest.

| What the broad rule forbade | Keep it? |
|---|---|
| `read()` falling through from Segment to Entry | **Yes.** This is the whole point |
| An Entry aggregating its Segments into its own cell | No — Q8 |
| An Entry listing its Segments (`entry.segments`) | No — it ships |
| A Segment naming its row (`segment.entry()`) | No — it ships; J-plan-6 reversed |

- **A `read(key)` never falls through.** `segment.read('hours')` answers that Segment's value or nothing. A consumer who reads a bar's hours never wonders which object answered.
- **Navigation is not a read.** Without `segment.entry()`, a consumer who wants the row's name in a bar tooltip builds a `SegmentId → EntryId` map. The store holds that map (`entryIdOfSegment`, `data/entry-store.ts:463`). That is the stop rule's smell.
- **A Rollup is a write, not a fallthrough.** The row's cell is stored on the row. `entry.read('hours')` reads the row's own cell.

---

## Q8 — can an Aggregator run over Segments?

**Raised 2026-09-16, in the Q6 grill. RULED the same day: yes, onto the row's cell. Reverses the #421 text "No Aggregator ever runs over Segments".**

**Why the old rule existed.** The #421 text said: "No Aggregator ever runs over Segments, at any zoom (see 'Zoom never changes a Segment')." The reason was zoom folding: fold 365 day pieces into one bar at year zoom and sum the hours. That value depends on the view, so it stays forbidden. The rule also killed a rollup onto the row's cell, which depends only on the data. That was collateral damage.

**The ruling.**
- **An Aggregator writes a row's cell. It never writes a bar's value.** A Field with `rollUp` may read Segments. An `hours` key stored on day Segments totals onto the request row.
- **A row aggregates over its Segments and its children together.** One input, unioned. No precedence rule.
- **No source knob** — not per Field, not per Entry, not a global default. The author first asked for a knob ("Entry, Segment or child", on the Entry or global). No use case was found where the two sources disagree and both are right. If a real consumer needs one later, it goes on the **Field**, because where a value comes from is a property of the value. A per-Entry flag is stored classification (`plans/01` §2.5). A global default plus a per-Entry override is two knobs for one job (`plans/02`).
- A key with no `rollUp` shows an empty grid cell, as a key with no `rollUp` over children does today.
- **`distribute` onto Segments is not ruled and does not ship here.** Example: `hours: 40` on a row with five pieces could write 8 onto each. Rule it later.

**Why the union is safe.**
1. `min`/`max` are always right over the union. A row's span covers everything drawn under it. Only `sum` and `count` can disagree.
2. "Both sources" is rare after B2. B2 stops the Rollup minting a Segment for a derived parent (`data/rollup.ts:180`). After that, a row holds both only when a consumer authored both.
3. A disagreement is a modelling problem. The candidate case is planned vs assigned: a request row holds 40h planned in pieces, and each of two worker children holds 40h assigned. Union gives 120h. But that is two meanings on one key, and #421 already rules it: two meanings need two keys (`plannedHours`, `assignedHours`). A knob would let one key keep two meanings and hide the bug.

**The union does not double count.** Three pieces of 8h plus a child row holding 16h is 40h. The child's 16h already rolled up from the child's own pieces.

**What this changes.** The #421 "Out of scope" line "A parent showing the total of its children's Segment data" is void: a parent sums its children's cells, and those cells rolled up from the children's Segments.

---

## Q9 — is the envelope the Rollup over Segments?

**Raised 2026-09-16, in the Q6 grill, as the consequence of Q8. RULED 2026-09-17: yes.** In the author's words: "envelope will take a normal aggregator for roll up of segments to row." The author's Q4 words agreed: "the row should be rolled up using min for start and max for end".

**The proposal.** The envelope is an Aggregator already: `min` on `start` and `max` on `end`. Both names are registered (`AggregatorName`, `model/field.ts:13`). Core writes that Aggregator by hand in four places:
- `envelopeOfSegments` (`time/instant.ts`)
- `reconcileEnvelope` (`data/entry-reader.ts:320-360`)
- `fitSegmentsToEnvelope` (`data/rollup.ts`)
- `widenSegmentsToEnvelope` (`data/rollup.ts:164-197`)

ADR 0013 says only the Rollup writes a rolling-up row's cell. Today `reconcileEnvelope` writes `start`/`end` on a segmented row beside that rule. If the Rollup takes Segments as input (Q8), `start`/`end` come back inside it. The envelope becomes a declaration, not a code path.

**What a ruling changes.** Q4's naming-trap paragraph retires. The #421 "Terms" line ("Do not write rollup for this pass") retires. ADR 0013 may need a revision note, because #421 says ADR 0013 does not change.

**The ruling.** A row's `start` and `end` roll up from its Segments through the normal Aggregators, `min` and `max`. There is no separate envelope pass.

**`min`/`max` over Segments are not special** (author, 2026-09-17). They are the same Aggregators, run by the same Rollup, that `start`/`end` use over children today. `start` and `end` are core Field declarations with `rollUp: 'min'` and `rollUp: 'max'`, in the same shape as a consumer's `hours` with `rollUp: 'sum'`. No code path checks for `start`/`end`, and no code path checks whether the input is a Segment or a child. A special case for either is a bug. The four hand-written paths above retire into the Rollup. "Envelope" stays a plain word for the result, never the name of a pass. Q4's naming-trap paragraph and the #421 "Terms" line retire. ADR 0013 gains a revision note, through a new ADR (ADR 0006's rule): the Rollup's input is a row's children and its Segments.

---

## Q10 — Option C's shape: name, collections, the plain bar, a row's dates

**Raised 2026-09-17, while rewriting the plan to C. RULED the same day, four answers.**

1. **The bar's public name is `Segment`.** The word widens: every bar is a Segment, and a plain row has exactly one. No new glossary term. ADR 0010 already makes the Segment the selection unit.
2. **SUPERSEDED by Q13 the same day** — the doors stay on `dataset.entries`. Original answer: **Two collections, one per concept.** `dataset.entries` holds rows: grid, hierarchy, row cells. `dataset.segments` holds bars: `get`, `add`, `update`, `remove`. This is one door per concept, not one door per kind of bar. `updateSegment`, `addSegment` and `removeSegments` do not ship.
3. **A plain row's Segment is backed by the Entry.** The plain row stores `segments: []`. Its live Segment has a minted id and reads and writes the Entry's own record. A write through `entries.updateSegment` lands as `store: 'entries'` rows (Q13 renamed the door). The minted id stays out of every ChangeSet row (J-plan-1). This is not a read fallthrough (Q7): the plain Segment has no values of its own to fall through from.
4. **A write to a segmented row's `start`/`end` follows the rolling-up parent's rule.** No new rule. Measured on 2026-09-17: core `start`/`end` already declare `rollUp: 'min'`/`'max'` (`src/data/fields/core-fields.ts:50-63`). ADR 0013 refuses `update()` on a rolling-up cell with `DerivedFieldNotWritableError` unless the Field declares `distribute` (amendment, 2026-09-11). A parent bar drag moves the descendants and does not write the parent. A segmented row takes both rules as they are: the write is refused, and a row drag moves its Segments.

**What these retire.** `reconcileEnvelope`'s sole-Segment mirror (a row date write copied onto its one Segment) goes, because the write is now refused. `fitSegmentsToEnvelope` and `widenSegmentsToEnvelope` go, because the Rollup reads Segments and never writes them (Q9).

**One consequence for B2.** A live plain row now answers its minted Segment in `entry.segments`. So `layout/frame-memory.ts` may keep reading `entry.segments`, and the `LayoutInput` port the first plan needed may be unnecessary. B2 checks whether that file reads the live or the stored Entry, and logs a J.

---

## Q11 — Option C details that Q10 does not answer

**Raised 2026-09-17, while rewriting the plan to C. RULED the same day — read "The ruling" at the end of this entry.** The questions below are the record.

**(a) The names of the two rule lists — B5.** The row list decides `items`. The bar list decides `paint`, `css`, `can` and `barLabels`, one Segment at a time. Two lists make "a bar rule that answers `items`" unrepresentable. Run the naming skill. Today `variants` is one list of `EntryVariant`.

**(b) One signature for `WriteRule` and `formatValue` — B6 and B7.** Both serve a grid cell (a row) and a bar (a Segment). Hard rule 4 bars `(entry, segment?)`. Options to weigh: one argument typed `Entry | Segment`; two named keys on the rule (a row rule and a bar rule); or a context object that names its source. Do not ship an optional second argument.

**(c) The `EditExtender` return shape — B4.** Q10 made two collections, so a cascade writes rows and bars. Options to weigh: one object with an `entries` map and a `segments` map (the working name `DatasetEdits` came from Q6's first pass); or one map keyed by a branded id union. #209's rule still binds: a plugin author writes exactly what the public doors take, keyed the way those doors key them.

**(d) What a bar-list seam receives for an Item that draws no single Segment — B5.** `ignoreSegments`, `fixedWidthItem` and a `summary()` rail over a segmented row draw one Item that stands for several Segments, or none. `BarRendererContext.segment` is required under C. Decide what those Items get, without making `segment` optional again.

**(e) Q1's plain-bar edit under the parent write rule — B3.** Q1 ruled that `entries.update(id, { segments: [], start, end })` leaves a plain bar. Q10 refuses a `start` write on a segmented row, and ADR 0013 refuses a mixed patch whole. Check whether the write resolver judges the row's rolling-up state before or after the patch. If before, Q1's call site throws, and the author rules which rule gives way.

### The ruling, 2026-09-17

The author took every recommendation. Each one was measured against the code and the docs before it was made.

**(a) One `EntryVariant`, one new key: `whenSegment`.** The author: "same variant as bar except we would have a second option for segment".
- `bar()`, `summary()` and `diamond()` stay. `GanttOptions.variants` and `ctx.variants.add` stay. ADR 0018's "one object, one name" holds.
- `when` picks rows: a field match or `(entry) => boolean`, unchanged.
- `whenSegment` picks bars: a field match or `(segment) => boolean`. One argument.
- Both present is AND.
- A variant with `whenSegment` cannot set `items`. The type says `items?: never`, because a row's shape cannot depend on one bar.
- A plain row's Segment reads the Entry, so `whenSegment: { locked: true }` also claims a plain bar.
- Naming check: glossary term Segment; "fullDay: when a segment's hours are 8" reads true; `whenSegment` names one concept; it pairs with `when`.

**(b) `interactions.edit` stays the cell rule. `formatValue` names its owner.**
- Measured: `WriteRule` is `(entry, field)` (`model/interactions.ts:35`, #256). Only `view/capability.ts:141-168` asks it. A bar drag reaches it through `can('resize')` → `mayWriteTheDatesItSets`. The glossary says the Timeline pane's unit is the Segment and the Grid pane's is the cell.
- `edit: (entry, field)` keeps its signature and gates the cell editor and the keyboard.
- A bar drag stops asking `edit`. It asks `move`/`resize: (segment)` and the library rule on the Segment's Field (`editable`, derived refusal).
- **Behaviour change:** `edit: (entry, 'start') => false` no longer locks a bar drag. A consumer writes `resize: (segment) => …` or sets `editable` on the Field. The `Interactions.edit` doc line "gates … the bar's resize handles and the bar move alike" goes.
- `formatValue(value, ctx, owner: Entry | Segment)`. Measured: one production call site today (`view/grid-columns.ts:131`). Both types answer the same `read(key)`, so `owner.read('currency')` needs no narrowing — the #240 use. The parameter is not `entry` (false for a bar), not `source` (`rowSource`), not `reader` (ingest readers).
- `parseValue` stays `(text, ctx, entry)`. Only the cell editor parses.

**(c) `EditExtender` returns `DatasetEdits`.**
- `type DatasetEdits = { readonly entries?: EntryEdits; readonly segments?: SegmentEdits }`.
- `SegmentEdit` is the object `updateSegment` takes. `SegmentEdits = ReadonlyMap<SegmentId, SegmentEdit>`.
- `mergeEntryEdits` becomes `mergeDatasetEdits`.
- One occupant per hook (D4) holds.
- #209 generalizes: a plugin author writes exactly what the public doors take, keyed the way those doors key them.
- Refused: a branded id union. `SegmentId` and `EntryId` are the same string at runtime, so core cannot tell the store without a lookup.
- **Refused write:** a `SegmentEdit` on a plain bar and an `EntryEdit` that name the same Field of one Entry. Two answers to one value.
- Measured: no production extender exists, only tests (`transaction.test.ts`, `edit-extension.test.ts`, `gantt.test.ts:5925-5942`). The rename is cheap.

**(d) A bar that stands for several Segments gets all of them.**
- Measured: `ignoreSegments`, `fixedWidthItem` and the `summary()` rail draw one Item with no `segmentId`, and it stands for every Segment of its Entry (`frame-memory.ts:140-145`, `FrameBar.segmentIds`).
- Under Q10 a plain row and a summary parent each have exactly one Segment. Only a whole-span bar over two or more authored Segments stands for several.
- `BarRendererContext = { entry, segments, item, label? }`. `segments` is never empty.
- `whenSegment` never claims a bar that stands for several Segments. The row's winner paints it.
- `can('move' | 'resize' | 'select')` asks every Segment the bar stands for. One refusal refuses the gesture — ADR 0010's multi-Segment drag, and ADR 0013's "one veto refuses the whole gesture".

**(e) Derivation is read before the patch.**
- Measured: `#splitDerivedWrites` (`data/entry-store.ts:592`) runs before anything stages. ADR 0013:180: "Derivation is read at the moment the write is proposed." A mixed patch is refused whole (ADR 0013:85). Test `entry-store.mutation.test.ts:785` already writes a structure change and a date as two calls in one transaction.
- The rule stays. Q1's one-call form `update(id, { segments: [], start, end })` throws on `start` for a segmented row.
- A plain bar from a segmented row is two calls in one transaction, one undo:
  `dataset.transaction(() => { entries.update(id, { segments: [] }); entries.update(id, { start, end }); })`.
- `#hasChildren` becomes `#derives`: children or authored Segments. "Derives" is the glossary's verb ("an Entry derives when it has children"). `resolveWriteTarget` takes it.
- Measured in passing: `segments` itself has no `rollUp`, so `update(id, { segments })` on a derived row resolves to `'entry'` and is not refused.

---

## Q12 — how does `update(id, { segments })` treat the array?

**Raised 2026-09-17 by the author: "How does update work when you pass an array to modify entry? It should work the same way." RULED the same day.**

**Measured.** `update()` patches at the key level: named keys change, others stay. A key's value is replaced whole: a props array replaces, never merges. Today `segments` replaces the list, and an element with no `id` keeps the id at its position (`data/entry-reader.ts:602-614`, #212).

**The ruling.**
- The array replaces the list: which Segments exist, and their order. An omitted Segment is removed.
- Each element replaces its Segment's values. `{ id: 'd2', start, end }` with no `hours` clears `hours`.
- An element with a known `id` is that Segment. Any other element is a new Segment with a fresh or named id.
- **The positional id match retires.** It was the only way to move one Segment before `updateSegment`. With `updateSegment` its reason is gone, and a positional match swaps ids under the Selection on a reorder.
- Merging one Segment's values is `updateSegment`'s job. `update` sets the list; `updateSegment` patches one Segment. The two doors do not overlap.
- Internal writers (a drag commit, `moveEntryTo`) send full elements with ids, so they keep every Segment's data.

**Confirmed by the author, 2026-09-17, after a survey.** The author asked how comparable libraries do this and how our Entry does it.
- **Our Entry.** `update` patches keys; each named key's value is written whole by `writeField` (`data/fields/field-access.ts:330-342`), so an array value replaces and never merges. Only the `props` bag merges, per key. The positional match is the one place an element is matched rather than replaced. The store has no array operators: `add`, `update` and `remove` each take one Entry.
- **Comparable Gantt libraries** (surveyed; names stay out of this file by the vendor-name rule). One stores a split piece as an ordinary child task drawn on the parent's row, so there is no nested array. Two keep a `segments` array or a joined segment source and edit pieces through split/merge commands. None of the three documents an element-level merge on an array write.
- **General data APIs.** JSON Merge Patch (RFC 7396) replaces arrays whole. Document stores replace an array on a field write and offer separate add/remove operators.
- **The pattern.** An array write replaces it. One-item changes get their own doors. Here those doors are `updateSegment`, `addSegment` and `removeSegments`.
- **Refused: an element with a known `id` keeps the values it does not name.** That makes one array value merge while every other array value replaces. `updateSegment` is the merge door.

---

## Q13 — `updateSegment`, or `dataset.segments.update`?

**Raised 2026-09-17 by the author: "we should still have updateSegment for convenience to user". RULED the same day. Supersedes Q10 answer 2.**

- The doors are `dataset.entries.updateSegment(id, edit)`, `addSegment(entryId, input)` and `removeSegments(ids)`. There is no `dataset.segments` collection.
- Shipping both would give one job two names (`plans/02`: one name per concept).
- This reverses less: `removeSegments` already lives on `entries` (`model/dataset.ts:69`).
- The ChangeSet row stays `{ store: 'segments', id, field, from, to }`, keyed by the Segment's own id. `DatasetEdits.segments` keeps its key.

---

## Q14 — should every spanning row store a Segment?

**Raised 2026-09-17 by the author, as an idea to test: "What if every bar is just a segment? … if they don't set segments we create the segment for them." RULED the same day: no. Q10's storage stays.**

**What the idea wins.** It is today's storage: ingest mints one Segment for every spanning Entry (`data/entry-reader.ts:122-124`). It would delete the minted-id index, the Entry-backed plain Segment and the `LayoutInput` port, and the Selection id would be a real id.

**Why it is refused.**
1. **Every leaf's rolling-up cell turns read-only.** Under Q8's union, a leaf that stores one Segment derives. A consumer `cost` with `rollUp: 'sum'` rolls up from a Segment that holds no `cost`, so `entries.update('task', { cost: 500 })` throws `DerivedFieldNotWritableError`. Test `entry-store.mutation.test.ts:904` pins the opposite today. Each fix is worse: "derive at two or more Segments" is a count special case; "derive when a Segment stores the key" makes derivation data-dependent; dropping the union loses row totals.
2. **Dates are stored twice on a plain row.** `reconcileEnvelope`, `SegmentsOutOfSyncError` and the sole-Segment mirror exist to keep that pair in step.
3. **A row that gains a child keeps its stored Segment.** `min`/`max` over the union then hold the parent's bar at least as wide as the old leaf span. The fix drops authored Segments on a new child, or makes the Rollup write the parent's Segment — which brings back `fit`/`widen`.
4. **A copy needs a flag.** `toInput()` would emit `segments` for every row, and omitting the helper-made one needs a stored "made by the helper" mark (`plans/01` §2.5 forbids it).
5. **Two dating rules remain anyway.** A one-date row has no Segment (ADR 0012).

**What the author wanted is kept.** The consumer sees every bar as a Segment. `entry.segments` is never empty for a spanning row. A summary parent answers one Segment, so `summary()` is a variant over that Segment. How many Segments a row has is the only difference. The cost is one internal branch: a plain row's Segment reads and writes the Entry's record.

---

## Q15 — which ChangeSet rows do structural Segment writes make?

**Raised 2026-09-17 by a cold-read audit of the plan. B4. RULED the same day: the author took the recommendation below as written.**

**The gap.** J-plan-3 says `addSegment` and `removeSegments` each write one structural `segments` row, and a drag commit and `moveEntryTo` send whole `segments` arrays. Q5's undo argument says a whole-array row can restore the array over the per-Segment rows beside it. The refusal "a `segments` array and a `SegmentEdit` for a Segment inside it, in one transaction" was written for an explicit array write. Read literally, it also refuses `addSegment('req-1', …)` beside `updateSegment('d2', …)` on a sibling in one transaction, and a drag beside an extender cascade. Story 10 and story 5 would then collide.

**Not yet measured.** Whether a transaction's rows are diffed once at commit (both inverses restore the pre-transaction state, so no value is lost) or recorded per call (order matters) decides how real the loss is. B4 measures it first.

**Recommendation.** Write structural changes as per-Segment rows, the same shapes the entries store already has:
- `addSegment` writes one `{ store: 'segments', entity }` added row. `removeSegments` writes one removed row per Segment. This mirrors `EntityAdded`/`EntityRemoved` (`model/change-set.ts:20-25`).
- A drag commit and `moveEntryTo` change no membership, so they write `start`/`end` value rows per Segment, not an array.
- Only `entries.update(id, { segments })` writes a whole-array row. The refusal stays narrow: that call beside any `store: 'segments'` row for the same Entry, in one transaction.
- J-plan-3 changes to match.

---

## Q16 — what does `removeSegments` do to a derived row's minted id?

**Raised 2026-09-17 by a cold-read audit of the plan. B2. RULED the same day: the author took the recommendation below as written.**

**The gap.** A summary parent is a plain row with one minted Segment. `removeSegments([thatId])` "un-dates the row" by the plain-bar rule. But the parent's `start`/`end` are derived cells, and only the Rollup writes them (ADR 0013). Measured: today `#removeSegmentsFrom` skips the date clear when `#hasChildren` is true (`data/entry-store.ts:721-728`), so the call does nothing to the dates, in silence.

**Recommendation.** Refuse it with `DerivedFieldNotWritableError` on `start`, the same refusal `update(parentId, { start: undefined })` gives. A silent no-op is the fault class #197 closed. A consumer who wants the parent dateless removes or un-dates its children.

---

## Q17 — is a bar a regular child Entry, drawn on its parent's row?

**Raised 2026-09-17 by a cold-read review the author asked for. RULED the same day — read [Q17 RULED](#q17-ruled-2026-09-17--a-bar-is-a-child-entry) below, not this entry.** This entry is the record of the question as it stood before spike S4 ran. The words *OPEN*, *not ruled* and *if S4 fails* below are that record, and they are no longer live.

**The design is in [`CHILD-ENTRY-DESIGN.md`](CHILD-ENTRY-DESIGN.md). This entry is the record of why it re-opens Q6.**

**The finding.** The Q6 grill listed eight doubled doors and chose Option C to remove them. Q10–Q13 brought seven back: `read` twice, `update`/`updateSegment`, `add`/`addSegment`, `remove`/`removeSegments`, `when`/`whenSegment`, `EntryEdits`/`SegmentEdits`, and `store: 'entries'`/`store: 'segments'`. Only the optional `segment?` argument went away. The issue title lists a name, props, a variant and capabilities, and an Entry already has all four.

**This is Option B from the Q6 grill, with its three costs re-read.**
1. *Perf was "the decisive objection".* No one measured it. S4 measures it first.
2. *"The grid and the timeline must share one row list, driven by the same variant decision."* The rule goes on the row source, which already owns the row list. No variant decides it.
3. *"The default inverts."* One row source key states it.

**What the grill did not know.** Core already draws several Entries on one Row: the `group` row source does it, and `FrameLayoutView.entryIdsForRow` answers every Entry a row owns. `layout/rows/entries-source.ts:40` writes a one-element `entryIds` list, and the change is to fold a claimed parent's children into it.

**The author's words, 2026-09-17.** "I like the render split option and think we should be able to define this per entry. or per row. or maybe doing the same when pattern that variants use." The design answers all three with one key: the rule takes the `when` pattern; per-Entry control is a consumer Field the rule matches; per-row is per-Entry, because a `RowId` equals the `EntryId` for the entries source. The author then confirmed the meaning of "child": what was a Segment is a regular Entry with `parentId` set, and nothing on the child marks it.

~~**Not ruled.** The eleven open points in the design file, the name of the key among them.~~ **Closed 2026-09-17.** All fifteen former open points are ruled in [`CHILD-ENTRY-DESIGN.md`](CHILD-ENTRY-DESIGN.md), and the key is `childrenAsSegments` (Q24).

~~**If S4 fails,** Option C stands. The same review found six gaps in it, listed at the end of the design file. Each becomes a Q then.~~ **S4 did not fail.** Option C is void, its six gaps have no subject, and the six-fix list was removed from the design file.

---

## Q18 — is the rule Gantt-wide or per Entry, and does it need `tree`?

**Raised 2026-09-17 by the author, reading `docs/08-a-bar-is-an-entry.md`. Answered inside the Q17 design the same day. It is not ruled, because Q17 is not ruled — S4 decides both together.**

**The author's words.** (The glossary word is not "pack" — lane packing is retired, `CONTEXT.md`, *Row*.) "You can only define a row pack globally. You should be able to do it globally but also per entry… so a parent can be a summary grouped view that has children which are many segments on one row. Also we use tree somewhere and I don't think we need that."

### 1. Both, through one key

`childrenAsSegments` runs **once per parent Entry** in the layout pass, so its scope is whatever the rule asks. Gantt-wide is `true`. Per Entry is a field match on a consumer Field. Default-on with an opt-out is a predicate, because a field match is equality (`layout/items/variants.ts`) and a Field declares no default value.

The first draft of the page buried this in one paragraph under a Gantt-wide example, and the author read the design as Gantt-wide only. **The design did not change. The page did.** The API table now carries the per-Entry call site and the live toggle beside the Gantt-wide one.

**Per Entry stays a consumer Field.** A core key on the Entry is refused for two reasons that both still hold: core would read a stored classification (`plans/01` §2.5), and two Gantts on one Dataset could no longer disagree (I2).

### 2. A summary row above a claimed row already composes

The rule claims the parents that carry bars. Their own parent is unclaimed, keeps its row, wears `summary()` and rolls up over the whole subtree in the one bottom-up pass. Three levels: `site-a` → `req-1`/`req-2` (each carrying its days) → the days. No stage of the layout pass learns a new case.

A claimed parent is **already** a summary in the grid: its cells roll up from its children (ADR 0013). The design suppresses its own bar `Item` alone, so `summary()`'s rail does not paint over the children it stands for.

**The other direction does not work**, and stays open point 5: one row carrying bars of its own *and* child rows below.

### 3. `tree` is orthogonal, and the two-level call site drops it

`tree` decides whether an **unclaimed** parent's children nest. The rule decides whether a **claimed** parent's children become rows at all. Neither reads the other.

- The two-level roster names no `tree`. Nothing nests, `nestsRows` stays `false` (`row-source.ts:107`), and the grid pane stays a `grid` — no row carries an `aria-level` it cannot justify.
- The three-level case names `tree: true`, and it earns it: `req-1` must sit under `site-a`.

**One build consequence.** `resolveEntriesSource` returns early in the flat branch (`entries-source.ts:48-50`) and never builds the parent index, so the fold needs `entryTreeIndex` in both branches. The tree branch also sets `expandable: children.length > 0` (`:69`), which a claimed parent must clear.

**`tree` itself stays.** It is a shipped key with its own job, and the three-level case needs it. What went is `tree: true` in the examples that never nested a row.

### What changed

- `docs/08-a-bar-is-an-entry.md`: two new sections (`tree` is a separate question; a summary row above a claimed row), the scope section rewritten around the three call sites, and `tree: true` dropped from the two-level example.
- `CHILD-ENTRY-DESIGN.md`: the same three answers, plus two spike questions (4 and 5), two spike steps, and amendments to open points 4, 5 and 6.

### 4. The `type` example went, the same day

**The author, reading the page:** "I don't understand what `childrenAsSegments: { type: 'request' }` is. What does `type` request do here? Is this to define the variant?"

**No — it is a field match, and the example taught the wrong thing twice.**

1. A consumer Field called `type` reads as a stored classification, which core does not have (ADR 0013, `plans/01` §2.5). A reader cannot tell the example's invented Field from a core one.
2. It collided inside its own code block: `{ key: 'type', type: 'text' }` uses the word as a Field key *and* as the Field's declared type.

Both examples now use one Field the page already had, `showDaysOnRow`, so the dataset, the rule and the live write tell one story. The "any value the data already holds" call site is `{ team: 'framing' }`, which is the vocabulary `row-source.ts` and the variants docs already use. Both files gained a paragraph stating what a field match is and that it neither names nor picks a variant — `when` asks how a row looks, this key asks whether a parent gives its children rows.

---

## Review, 2026-09-17 — the child-Entry design, verified against the code

**An agent review the author commissioned, checked line by line before it was acted on** (CLAUDE.md: a review's account of the code is a claim; open the file). Nine findings came in. Every one holds. Two more came out of the check.

### Confirmed, no change needed

1. **The Rollup claim holds.** One bottom-up pass on every commit. A child bar is a leaf; a claimed parent rolls up through ADR 0013's existing machinery. No new pass.
2. **The envelope machinery is worth deleting.** `rollup.ts:139-159` — clamp, then widen, with a positional tie-break — exists only because a rolling-up parent may *also* own Segments. A child Entry can never be both, so the whole #212 R2 saga goes with it. Read that comment block once: it is the single best argument for this design.
3. **Ids are stable across sessions.** Every bar's Item id becomes `itemId(entryId, 0)` (`ids.ts:39`, `item.ts:102`) — an authored `EntryId`. Option C's plain-bar id is a counter (`dataset-state.ts:271-278`).
4. **`collapse.ts:18-21` and `entries-source.ts:40/48/69` are as the design describes.**

### Confirmed, and the design was wrong

5. **The multi-Entry row precedent is the `custom` source, not the `group` source.** `group-source.ts:40` gives every member its own row with `entryIds: [id]`; only the header is shared, and it holds `entryIds: []`. `CustomRow.entryIds` is a list and `resolveCustomSource` maps all of them onto one row (`custom-source.ts:14,20`). The mechanism is real, the citation was not. Fixed in the design and in the page's flow diagram.
6. **"A row filter can hide one bar" does not follow, and nothing does it.** `filter.ts:8-10` reads one Entry per row and `applyFilter` keeps or drops whole rows (`:69-76`); Items are produced only after a row survives. The bullet is withdrawn and the question is **Q20**.

### Confirmed as unruled seams — now Q19, and open points 12–15

7. **The suppression and the rail are one seam, and the design ruled neither.** `produceItemsForRow(row, entryById, registry)` loops `row.entryIds` and resolves a variant per Entry (`produce-items.ts:29-45`). Nothing in that signature says the row claims its parent. So "core draws no Item for a claimed parent" and "a consumer variant may still paint a rail" need the same answer.

   **One correction to the review.** It reads this as re-opening the coupling the design closed by refusing a variant key. It does not. That refusal was about *who owns the row list*, and a marker written by the row source and read by item production leaves the row source the sole owner. The seam is unruled — that part stands — but it is not the closed question coming back.

8. **The Selection change is a build, not a delete.** 16 non-test files name `segmentIds`, plus `view/segment-selection.ts` as its own module, plus `Item.segmentId`, `frame-memory.ts:96-130`, `frame-layout.ts:142`, the `data-segment-id` stamps, `reveal` and the keyboard path. The "What each layer sees" table read like a tidy-up. It is an ADR 0010 revision and real work. Open point 15.
9. **Migration needs its ADR sooner than open point 9 said.** Segments shipped in S4 and this library has never shipped to a user, so the clean read is to delete the `segments` Field key outright with no legacy path. One ADR settles it. Open point 15.

### Two findings the check added

10. **`entryIds[0]` is an unwritten convention at nine sites, and this design is what makes it load-bearing.** `render/dom/index.ts:963` states the concept in a comment — *"The Entry this row's cells describe (#185) — the row's subject, not the set it owns"* — and expresses it positionally. The other eight are `render/dom/index.ts:1039`, `gantt-shell.ts:1480`, `segment-selection.ts:170`, `roving-focus.ts:311`, `sort.ts:53-54`, `filter.ts:9` and `frame.ts:330`. An entries-source row holds exactly one id today, so `[0]` is unambiguous. A claimed row holds N+1, and all nine silently change meaning. This is bigger than finding 6, which is one of the nine.

    It also suggests the shape that may dissolve finding 7: if `PlannedRow` **names** its subject and `entryIds` means only "the Entries whose Items this row draws", the claimed parent is simply not in the list, and no suppression logic exists anywhere. The rail then becomes the open question instead. Q19 writes both shapes rather than ruling one here.

11. **Overlapping bars on one row have no vertical answer.** Lane packing is retired (#298): every Item on a Row draws at one shared band. Authored Segments rarely overlapped; two child Entries with overlapping dates are trivial to author. What is on top, and what does a hit test return? The question did not exist under Option C. Open point 14, spike question 6.

### What the review changed

- The design: two wrong claims corrected, four open points added (12–15), the spike rewritten.
- The spike: **a 10,000-bar baseline on today's design before anything changes** (the author's instruction — a number with nothing to compare against answers nothing), a comparison run against it, Q19's two shapes written rather than chosen, and a standing question 14 — *is there a better API than the one this plan drew?* — logged as the code meets each call site. Estimate 2 h → 4 h.
- The log: Q19 and Q20 opened.

**The verdict stands.** On the measured evidence the child-Entry design is the stronger idea: stable ids, a bar that moves across rows with one write, an editor surface for bar data, and the deletion of the ugliest logic in the codebase. Findings 7 and 10 are the seams that decide whether it stays simple.

---

## Q17 RULED, 2026-09-17 — a bar is a child Entry

**The author ruled it after spike S4 reported.** The design file is now the design of record, and this entry says what changed with it.

**What the measurement settled.** The Q6 grill called 10,000 child Entries "the decisive objection", and nobody had measured it. S4 measured a baseline on the shipped Segment design first, then the same 10,000 bars as child Entries: the frame builds **20% cheaper**, and the two costs that grew — one write, one row resolution — each **halve** when the Rollup stops re-deriving an index `EntryStore` already memoizes. The objection does not survive the number. Read `SPIKE-FINDINGS.md` for the table and for the two honest limits on it.

**What that makes void.** Option C, its builds B1–B8, and Q1–Q16 with them. Each of those sixteen rulings settled a detail of the `Segment` type, and the type does not ship. The bodies stay as the record of what was refused and why.

**What is ruled with it.** Q18 (the rule is Gantt-wide and per Entry through one key; `tree` is orthogonal), Q19 (shape (a)), Q20 (a filter cannot hide one bar, and this work does not add a knob), and the nine `J-plan-*` calls in `README.md`.

**What is now open, and holds work.** Q21 (does the entries row source take the Field registry?) holds C1. Q22 (a `boolean` Field type) holds the examples in the docs. Q23 (does a hierarchy source declare its keys?) is wider than #421.

**What moved out of #421.** Two jobs this design makes possible, each its own issue: a vertical drag that moves a bar to another row, and a filter that hides one bar on a shared row.

**Three spike questions were not reached** — Q8 (the user stories in the harness), Q10 (the live per-Entry switch through one undo step) and Q11 (a summary row above a claimed row, three levels). They are not re-spiked. C1 and C3 land them as real tests, which is where they belonged: a probe cannot prove a harness story.

---

## Q20–Q24 RULED, 2026-09-17 — the author's answers, in one sitting

Five questions went to the author with the Q17 ruling. All five are closed — Q23 last, on 2026-09-17, by splitting it out as **#426** to be decided on its own evidence.

### Q24 — the key is `childrenAsSegments`

**The author's words.** "childrenAsSegments or childrenAsRowSegments I think."

**`childrenAsSegments`, without the `Row`.** The key already sits on `rowSource`, so `Row` in the name repeats its own context. The call site reads: *"row source: entries, children as segments, where show-days-on-row is true."*

**It discriminates, which `childrenAsBars` did not.** An unclaimed parent's children draw a **bar on a row of their own**. They never draw a **segment of another row's bar**. The word carries "a piece of something bigger", which is the whole distinction.

**The cost, stated plainly.** The `Segment` **type** retires in C6, so between C1 and C6 the word names two things — the retiring type and the new key. That is the fault class #7 named, when "chart" meant both the public `Gantt` and an internal `view/` class and stalled a review. It is bounded here, and C1 bounds it: `CONTEXT.md`'s *Segment* entry is rewritten on the day the key lands, not in C7, so one entry tells one story with a build number on it. After C6 the word has one meaning and no type behind it: **a child Entry drawn as one piece of its parent's row.**

### Q22 — core ships a `boolean` Field type

Ruled yes. It lands in **C1**, not in the docs build, because the rule's own examples are its first consumer: `{ key: 'showDaysOnRow', type: 'boolean' }` is how a consumer marks the parents the rule claims. Today that throws `UnknownFieldTypeError` (`data/fields/field-registry.ts:70`), because `FieldTypeName` (`model/field.ts:14`) ships `text`, `number`, `percent`, `date` and `duration` only. C1 gives it ingest, `formatValue`, `parseValue`, `compare` and `equals`, the same shape every other type has.

### Q21 — the entries row source takes the Field registry

Ruled yes: thread `fieldContext` into the entries-source pass. **The reason is the silent failure.** `childrenAsSegments: { showDaysOnRoww: true }` claims no parent, draws no segment, and says nothing — a blank screen with no error, which is the fault class #197 closed. With the registry threaded, the match uses each Field's own `equals` and an undeclared key reports once through `reportUnknownFieldMatch`, exactly as a variant's `when` already does.

**What it changes.** `row-source.ts`'s header says the row-source types are "Pure data: no pixels, no Dataset, no Field registry (D-S4-19, D-S4-21)." `RowPassInput` already carries `fieldContext` for `sort`, so the wire exists and the statement is already narrower than it reads. C1 rewrites that comment to say what is true: the row-source **types** stay pure, and the **pass** receives the Field context the same way sorting does.

### Q20 — a filter hides a parent, and its segments go with it

**The author's words.** "for hiding if a parent hides the children should hide."

**That is what the code already does, and it is the right answer.** `applyFilter` (`layout/rows/filter.ts:57-78`) keeps or drops whole rows, and its read gate is the row's subject (`:9`) — the claimed parent. A claimed parent's segments have no rows of their own, so dropping the parent's row drops every segment on it. Nothing ships, and no item-level knob exists.

**The consequence C7 states in the consumer docs.** A filter predicate on a claimed row is never asked about a child. So a filter cannot keep some of a row's segments and drop others. Hiding the parent is the whole answer. This is J-plan-F, rewritten from its first form ("refused; its own issue") — the first form treated a working behaviour as a gap.

### Q19's neighbour — the vertical drag is #425

The author confirmed the split. A bar moves between rows with one write today (`dataset.entries.update('d1', { parentId: 'req-2' })`). The **gesture** is missing: `interaction/entry-gestures.ts:300` drives hover visuals only, and nothing in `interaction/` reads the hovered row at commit. #425 carries the row-target step in the commit path, and the ruling on whether it is default behaviour or a capability.

### The Segment's retirement

The author confirmed it: the child-Entry design replaces the Segment, with no compatibility path and no legacy key. J-plan-G stands.

---

## Q25 — the duration option's new name, and what overlapping children count as

**Raised 2026-09-17 by a cold-read audit of the ruled plan. C6. RULED the same day: the author took the recommendation below, both halves.**

**The gap.** `README.md` says C6 renames `measureDuration: 'segments'`, `#421` says it "keeps its job under a new name", and C6's gate says "renamed and re-stated". No document gives the name, and no document gives a candidate. Every other name in this plan was ruled with its rejected list beside it (Q24, Q13, Q11(b)). A C6 agent would invent a public API name with no ruling behind it.

**The second half is worse, because it is silent.** `measureEntryDuration` sums the Segments today (`data/fields/field-access.ts:219-221`), and Segments of one Entry do not overlap. Children do — `J-plan-E` rules that two bars on one row draw at the shared band. A plain sum counts an overlapped hour twice. `README.md` says "the sum of its children's spans" and `#421` says the same; both are additive. The word *envelope* in the same sentence pulls a reader toward a union instead. Nobody states which.

**Recommendation, both halves.**

1. **The key stays `measureDuration`. The union member becomes `'children'`.**
   ```ts
   new Dataset({ entries, measureDuration: 'children' });  // the sum of this row's children's spans
   ```
   Read the call: "measure duration: children". The `Dataset` has no Gantt, so it cannot see whether a Gantt draws those children as segments — `'segments'` would name a drawing decision on a surface that cannot observe one. `'children'` names the data. Rejected: `'segments'` (the word is now a *drawing* word, ruled in Q24, and a `Dataset` does not draw), `'sumOfChildren'` (says the mechanism, not the job), `'work'` and `'worked'` (they name one industry's use of the number, and core never does that).
2. **Two overlapping children count twice.** A plain sum, unchanged from today's code. Two crews on one day is two days of work, which is what the number is for. A union is a different question and gets its own key if a consumer asks for one. `ADR 0017`'s revision note states the rule in one sentence, so no reader has to guess.

**The author's ruling, 2026-09-17.** *"measure duration segments would change to children. for the half nobody wrote down whatever the aggregator says."*

**What that means in the code.** Core states **no** overlap policy, in either half of the answer.

- **A consumer's own key already obeys it.** `hours` with `rollUp: 'sum'` is added by the `sum` Aggregator. Two children on the same day add to two, because addition is what `sum` means. A consumer who wants an overlapped hour counted once registers an Aggregator that does that, and names it. Core neither ships that Aggregator nor forbids it.
- **Core's own `duration` does the same thing, by hand.** `duration` is the one core Field that computes (`model/field-key.ts:20-28`), and a `compute` Field may not declare `rollUp` (`model/field.ts:190`) — so there is no Aggregator name to point at here. `measureEntryDuration` adds the pieces in a loop (`data/fields/field-access.ts:219-221`) and never looks at where they sit. Under `'children'` it adds the children the same way. **That is the same rule, in the one place the union cannot express it**: add them, do not inspect them.

**C6's work, stated.** The member becomes `'children'`. `measureEntryDuration` reads `access.storedChildrenOf(entry.id)` in place of `entry.segments`, so its first parameter stops being a `Pick<StoredEntry, 'start' | 'end' | 'segments'>` and it takes the access it already needs. ADR 0017's revision note states the new member and one sentence: **core adds the children and never reads them for overlap.**

**Rejected names**, recorded so C6 does not re-open this: `'segments'` (the word is a *drawing* word after Q24, and a `Dataset` does not draw), `'sumOfChildren'` (says the mechanism, not the job), `'work'` and `'worked'` (they name one industry's use of the number, and core never does that).

---

## Q26 — how a claimed parent asks for a rail instead of a bar

**Raised 2026-09-17 by a cold-read audit of the ruled plan. C2. RULED the same day: the author took the recommendation below, and drew its limit.**

**The gap.** C2's job says "the seam a consumer variant paints a rail through", and Q19 leaves that seam to C2. No document says what an author writes. Today a rail and a bar are two producers, not one shape with a flag: `ignoreSegments` returns one whole-span Item (`layout/items/item.ts:161-163`) and `followSegments` returns one Item per Segment (`:179-186`). C2 would invent the mechanism mid-plan.

**Recommendation: the claim changes the default producer, and nothing else.** A claimed parent's default `items` producer returns `[]`. A variant with an explicit `items` key still wins, so a rail is the producer that already exists:

```ts
new Gantt({
  rowSource: { source: 'entries', childrenAsSegments: { showDaysOnRow: true } },
  variants: [
    // "This row claims its children, and I still want one band behind them."
    { name: 'crewRail', when: (entry) => entry.read('showDaysOnRow') === true, items: wholeSpanItem },
  ],
});
```

**Why this shape.** No new key, no new type, and no second way to ask the same question. It keeps I14 — one resolution answers chrome and gesture — because the producer is the one the variant pass already resolves. It also gives C2 a one-line gate: a claimed row with no variant draws its children's bars alone; the same row with `items: wholeSpanItem` draws the band behind them.

**Two names C6 owes this seam**, and they belong to C6's rename sweep, not to a separate ruling: `ignoreSegments` becomes `wholeSpanItem` ("items: whole span item"), and the claimed parent's empty default is `noItems` ("items: no items"). `followSegments` retires with the type.

**The author's ruling, 2026-09-17.** *"if a bar has children with rowsegments it doesnt draw its own bar by default. I guess a user can do this in a varient if they choose to but we dont toouch this in core."*

**So C2's job is one deletion and one test, and core gains nothing.**

1. A claimed parent produces no Item of its own. That is the default, and it is the whole mechanism.
2. A variant with an explicit `items` producer still wins, exactly as it does today — `variants.ts:463` reads `variant.items ?? followSegments`, and a claimed parent changes only what that `??` falls back to.
3. **Core ships no rail.** No `rail` key, no rail variant, no rail helper, and no seam named after one. A consumer who wants a band behind the bars writes a variant and names the producer that already exists.

**One rename this pulls into C6, and it is not a new door.** The producer a consumer names is `ignoreSegments` (`layout/items/item.ts:161-163`), exported from `api/index.ts:394`. Its name carries the retiring word, so C6's sweep renames it. **Recommendation, so C6 invents nothing: `wholeSpan`** — read the call, `items: wholeSpan`, "items: whole span". `followSegments` is deleted with the type; an unclaimed Entry's default is one Item over its whole span, and a claimed parent's default is none. Rejected: `wholeEntryItem` (taken, and it returns one Item rather than a producer's array), `oneBar` (says the count, not the span), `entireSpan` (a second word for `whole`, and `CONTEXT.md` keeps one).

**What C2 proves.** A claimed row draws its children's bars and nothing else. The same row, with a variant that names the producer, draws the band behind them. Nothing in `src/**` mentions a rail.

---

## Q27 — a claimed parent draws no bar, and core's own `summary()` is the one that would

**Raised 2026-09-17, while writing Q26's ruling into the plan. C2. RULED the same day: the author took the recommendation below, and corrected its name.**

**The gap, and it is in Q26's own wording.** Q26 rules that a claimed parent draws no bar by default, and that a consumer who wants a band behind the bars names an `items` producer on a variant. Read that against the shipped code and it does not close:

- `produceItemsForRow` walks **every** id on the row (`layout/items/produce-items.ts:38-46`). On a claimed row that list is `[parent, d1, d2]`, so the parent is asked for Items like any other Entry.
- `summary()` claims on `entry.hasChildren` (`layout/items/variants.ts:321`). A claimed parent still has children — they moved onto its row, they did not stop existing.
- `summary()` **states `items: ignoreSegments` explicitly** (`:322`), and its own doc comment says why it refuses the registry's default.

So "an explicit `items` wins" hands the row to core's own rail, which then paints one band across the whole span, over the two bars it stands for. That is the exact thing C2 exists to prevent. The rule as written defeats itself on core's own variant, before a consumer writes anything.

**An unclaimed parent is not in this question at all** (author, 2026-09-17). Every branch below reads the claimed marker first. A row with no marker — a Gantt with no rule, or a parent the rule does not match — takes the path it takes today: its children get their own rows, and it wears `summary()`'s rail over them. Hard rule 6 in `README.md` makes that a gate, and C2 pins it with a test in the same frame as a claimed row.

**Where the suppression goes, and this part is not in doubt.** `produceItemsForRow` skips the row's subject when the row claims its children. It already takes the `PlannedRow`, and Q19 shape (a) puts the claimed marker there, so the fact is in hand and nothing new is threaded. The open half is the other one: **what lets a consumer put a band back, once core's own producer is not the way?**

**Is it one fact or two? One** (the author asked, 2026-09-17).

`childrenAsSegments` has two **spellings** — `true` claims every parent this Gantt draws, and a field match or a predicate claims some. Both spellings resolve in one place, `resolveEntriesSource`, into one claimed marker on the `PlannedRow`. A second flag beside it, Gantt-wide, would be a second source of truth for the same question, and hard rule 4 refuses that: the row source owns the row list. **So no name needs a `global` prefix, because there is no global fact to name.**

**There is a real two-ness here, and it is sharper than Gantt-wide against per-Entry.** `produceItemsForRow` calls a producer once per id on the row (`produce-items.ts:38-46`), and on a claimed row that is `[req-1, d1, d2]`. Two different questions could be passed down:

| The fact | `req-1` | `d1`, `d2` | Does it work? |
| --- | --- | --- | --- |
| **The row's:** "this row draws children as segments" | `true` | `true` | **No.** `d1`'s producer cannot tell itself apart from the parent, so a producer that suppresses on the flag draws nothing at all |
| **The Entry's:** "**this Entry's** children are the segments of this row" | `true` | `false` | **Yes.** Each producer is asked about the Entry it was called for, which is the only Entry it can answer for |

**So the fact is per Entry, and it reads `row.claimed && entry.id === row.entryIds[0]`** — the row's marker, narrowed to the row's subject. Q19 shape (a) already puts both halves in `produceItemsForRow`'s hand.

**The name is the key's name** (the author, 2026-09-17: *"i don't think claims children is the name we decided on"* — correct, `claimsChildren` was a third word for a ruled concept). The key is `childrenAsSegments`, so the fact is `childrenAsSegments`. A rule and its resolved answer are one concept, and `CONTEXT.md` keeps one word per concept. Rejected: `claimsChildren` (invents a verb the API never uses), `isClaimed` (wrong subject — the parent claims, it is not claimed), `drawsChildrenAsSegments` (a second word for the ruled one).

**RULED: the producer learns that one fact, and decides for itself.**

```ts
// layout/items/item.ts — the producer seam, one fact wider
export type ItemProducer = (entry: Entry, variant: string, childrenAsSegments: boolean) => readonly Item[];
```

```ts
// A consumer who wants the band back — core ships nothing for this
items: (entry, variant, childrenAsSegments) => (childrenAsSegments ? [ignoreSegments(entry, variant)] : []),  // `wholeSpan` after C6
```

- Core's `ignoreSegments` reads it and returns `[]` **when, and only when, this Entry's children are its segments**. An unclaimed parent is passed `false`, so `summary()` draws the rail it draws today, unchanged.
- It allocates nothing, so I5 holds. It adds no key, no variant, and no rail concept, so Q26's limit holds.
- It is one parameter on a public type, on a library that has never shipped. A producer that ignores it is unchanged — TypeScript accepts a function that takes fewer parameters than its declared type, which `item.ts:57-59` already relies on.
- **The type keeps today's names here, on purpose.** `Item`, `ItemProducer` and `ignoreSegments` are what C2 writes, because C2 lands before C6. **Q28 renames them in C6** — to `Bar`, `BarProducer` and `wholeSpan` — and nothing about this ruling changes but the spelling.

**The two alternatives, and why they lose.** Skipping the parent inside `produceItemsForRow` with no way back is simpler, and it refuses the opt-in the author asked for. Telling core's variants apart from a consumer's would work and is a fault line core must never have — the whole registry rests on core's own fields and variants taking one code path.

**What C2 builds, in two lines.** `produceItemsForRow` computes `row.claimed && entry.id === row.entryIds[0]` and passes it to `resolveItems`, and `ignoreSegments` returns `[]` when it is `true`. C1 writes nothing for this.

---

## Q28 — the layout unit is a `Bar`, and `ItemProducer` is a `BarProducer`

**Raised 2026-09-17 by the author:** *"i think we should look at changing item producer to barproducer"*. C6. **RULED the same day: the author took the recommendation below whole** — *"yes on 28 do it"*.

**Looked at, and the finding is bigger than the producer.** `ItemProducer` is named after its return type, so the producer cannot be renamed alone. The question is whether `Item` is the right word, and measured against this codebase's own naming rule it is not:

- **The word already names three things in `src/**`.** `Item` is the timed shape a variant draws (`layout/items/item.ts:25`). `MenuItem` is a context-menu row (`extensions/features/menu-view.ts:9`), and it is public. `CellItem` is a grid cell in the renderer (`render/dom/index.ts:134`). That is fault class #7 exactly — the one "chart" caused, where a generic word covered two concepts, nothing said which, and it stalled review #4.
- **Every consumer of an `Item` already calls it a bar.** `placeFrame` turns one into a `FrameBar`, whose own field comments say "the one Segment this **bar** draws" and "every Segment this **bar** stands for" (`layout/frame.ts:136-150`). `barSpan` places it, `BarRenderer` paints it, `barLabels` labels it, and `data-variant` stamps it. `Item` is the only name upstream of that, and it is the odd one.
- **A diamond is a bar here, and the code already says so.** `summary()`'s rail is `SUMMARY_BAR` and `variants.ts:232` calls it "a solid rail 10px high". `diamond()`'s glyph becomes a `FrameBar` with a fixed box. Core has one word for every painted span on the timeline, and that word is *bar*. `FixedBarBox` and `BarAnchor` sit on `Item` today, so the type already wears the word on two of its own fields.
- **#421 makes the word load-bearing.** This work's whole sentence is "a bar is a child Entry". A reader who then meets `Item`, `itemId`, `produceItemsForRow` and `hoveredItemId` has to learn that the library's word for a bar is a different word.

**RULED: rename, in C6, with `pk-rename-symbol`.**

| Today | C6 |
| --- | --- |
| `Item` | `Bar` |
| `ItemId`, `itemId()`, `itemIdFromDataset` | `BarId`, `barId()`, `barIdFromDataset` |
| `ItemProducer` | `BarProducer` |
| `VariantItems`, `EntryVariant.items` | `VariantBars`, `EntryVariant.bars` |
| `produceItemsForRow`, `resolveItems` | `produceBarsForRow`, `resolveBars` |
| `wholeEntryItem`, `fixedWidthItem` | `wholeEntryBar`, `fixedWidthBar` |
| `entryIdOfItem`, `hoveredItemId`, `movableItemId`, `grabbedItemId`, `barGeomByItemId` | the same, with `Item` → `Bar` |
| `MenuItem`, `CellItem` | **unchanged.** They keep the generic word because it is generic in its place: a menu has items, a grid cell is one |

**Why C6, and not its own issue.** C6 is already the rename build: `selectedSegmentIds` → `selectedEntryIds`, `segment-selection.ts` → `entry-selection.ts`, `ignoreSegments` → `wholeSpan`, and `itemId(entry, segmentIndex = 0)` losing the word *segment* from its second parameter. That last one is this same function. Renaming it twice, in two builds, spends two reviews on one symbol.

**The cost, stated.** 39 files in `src/**` name `Item` or `ItemId`, in 635 lines. `pk-rename-symbol` does the code through the language service, and `pnpm typecheck` confirms it. Prose does not follow: `plans/01` §2.4 ("Item identity is deterministic"), §11's **I8** row, `plans/02`, `CONTEXT.md`, and six ADRs (0003, 0010, 0017, 0018, 0022, 0023) each name the word and are decided by hand. **I8's own wording changes**, so `plans/01` §11 and the layout snapshot test's name move together.

**Do not do this before C6.** C1–C5 read shipped code against shipped names, and a rename in the middle makes every one of their diffs unreadable.

**What C1–C5 write.** Today's names, every one of them: `Item`, `ItemProducer`, `ignoreSegments`. C6 renames them in one pass, and Q27's parameter moves with its type. A build that renames early makes its own diff unreadable, and this ruling does not change that.
