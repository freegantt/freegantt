# A Segment is a bar — build log (#421)

**Q** is a question for the author. It waits. **J** is a call an agent made alone, so a reviewer can find it and reverse it.

Write the entry the moment it comes up, not at the end. Check that one does not already exist before you open a second.

**Status, 2026-09-17. No question waits. The plan README and #421 state Q1–Q14. Do not re-open a ruled one.**

**Read this table, not the old bodies.** An entry marked *Superseded* keeps its text as the record. Its job may survive. Its shape does not.

| | Question | Status |
|---|---|---|
| Q1 | does `update(id, { segments: [] })` make an Entry plain? | **Ruled**, then corrected — it leaves the row dateless. Q11(e): a plain bar from a segmented row is two calls in one transaction |
| Q2 | what does removing the last authored Segment leave? | **Ruled** — it un-dates the Entry, and the row stays |
| Q3 | does `addSegment` ship beside `updateSegment`? | **Ruled yes; Q13 confirms the name** after Q10 briefly moved it to `dataset.segments.add` |
| Q4 | does `updateSegment` write the Entry's envelope row? | **Superseded in shape by Q6/Q9.** A Segment write re-runs the Rollup, which writes the row's `start`/`end` rows in the same transaction |
| Q5 | can an `EditExtender` propose a one-Segment edit? | **Ruled yes.** `SegmentEdit`/`SegmentEdits` keep their names; Q11(c) puts them inside `DatasetEdits` |
| Q6 | is there one write door, or two? | **Ruled 2026-09-17: Option C.** Every bar is a Segment; Q10–Q14 fix the shape |
| Q7 | does an Entry read across to its Segments, or a Segment to its Entry? | **Ruled** — `read(key)` never falls through. Navigation (`segment.entry()`) ships. J-plan-6 is reversed |
| Q8 | can an Aggregator run over Segments? | **Ruled** — yes, onto the row's cell, never onto a bar. Segments and children union, no knob |
| Q9 | is the envelope the Rollup over Segments? | **Ruled 2026-09-17: yes.** `start`/`end` roll up from Segments to the row through the normal Aggregators (`min`, `max`). The four hand-written paths retire |
| Q10 | under C: the bar's name, where writes go, what backs a plain bar, a write to a segmented row's dates | **Ruled 2026-09-17** — `Segment`; the Entry backs a plain bar; the rolling-up parent's rule. **Answer 2 (`dataset.segments`) is superseded by Q13** |
| Q11 | the Option C details Q10 does not answer | **Ruled 2026-09-17** — (a) one `EntryVariant` + `whenSegment`; (b) `edit` stays the cell rule, `formatValue(value, ctx, owner)`; (c) `DatasetEdits`; (d) `BarRendererContext.segments`; (e) derivation read before the patch, `#derives` |
| Q12 | how does `update(id, { segments })` treat the array? | **Ruled 2026-09-17** — replaces the list; each element replaces its Segment; match by `id` only; positional match retires |
| Q13 | `updateSegment`, or `dataset.segments.update`? | **Ruled 2026-09-17** — `entries.updateSegment` / `addSegment` / `removeSegments`. No second collection |
| Q14 | should every spanning row store a Segment? | **Ruled 2026-09-17: no.** Q10's storage stays. Every bar is still a Segment to the consumer |
| J1 | S1's ChangeSet address | Measurement stands. **Its `segmentId` shape is superseded by Q6** — the row is `store: 'segments'` |
| J2–J3 | S2 and S3 findings | Ruled, from `SPIKE-FINDINGS.md` |

**Entries that record a reversed call.** Q1's first ruling was wrong. Q5's first shape was wrong, and Q6 then replaced Q3, Q4 and Q5's shapes. Q7 reverses the plan's first hard rule 3 and J-plan-6. Q8 reverses "no Aggregator over Segments". Q9 retires Q4's naming trap. Each keeps the rejected text, so a reader sees what was refused and why. Read the correction, never the first answer.

---

## Q1 — does `update(id, { segments: [] })` make an Entry plain?

**Raised 2026-09-16, in the plan. B2. RULED the same day, then CORRECTED the same day. Read the correction — the first ruling was wrong.**

Today it throws `EmptySegmentsError` (`data/entry-reader.ts:607`): under ADR 0012 a spanning Entry always held a Segment, so empty was illegal. Under #421 a spanning Entry with `segments: []` is the plain bar — the state every plain Entry stores.

**First ruling, wrong.** "`update(id, { segments: [] })` clears the authored Segments and keeps the Entry's dates, so the row draws one plain bar."

**The author refused it, and the code agrees with the author.** An Entry's dates are not stored beside its Segments. They **are** the Segments' envelope whenever Segments exist: `toEntry` reads `segments.length > 0 ? envelopeOfSegments(segments) : dates` (`entry-reader.ts:222`), and `reconcileEnvelope` recomputes the same value at `:355`. So clearing the Segments removes the only source those dates had. Keeping them would keep a stale span — the exact bug #212 finding 4 fixed, written down in `toEntry`'s own doc comment (`entry-reader.ts:205-211`).

**The corrected ruling.** `update(id, { segments: [] })` is **legal** and leaves the row **dateless**, unless the same edit names `start` and `end`. `EmptySegmentsError` retires, because empty is no longer illegal. It is simply not a span.

**Why the error's own reason died.** It had one: ADR 0012's biconditional, *an Entry holds at least one Segment if and only if it spans* (`docs/adr/0012-dates-are-optional-on-every-kind.md`, §Consequences). #421 retires that rule, because a plain bar stores dates and `segments: []`. The reason goes with the rule.

**How a consumer makes a plain bar from a segmented row:** ~~`update(id, { segments: [], start, end })`~~. **Corrected by Q11(e), 2026-09-17:** derivation is read before the patch, so that one call throws on `start`. Write two calls in one transaction, one undo: `dataset.transaction(() => { entries.update(id, { segments: [] }); entries.update(id, { start, end }); })`. `update(id, { segments: [] })` alone still leaves the row dateless.

**Two dating rules, one sentence each.** An Entry with no Segments keeps the dates it named, read straight (ADR 0012). An Entry with Segments takes their envelope. This is today's rule, and #421 does not change it.

**What B2 must change.**
- `EmptySegmentsError` retires — `src/model/errors.ts:370`, the throw at `src/data/entry-reader.ts:607`, and the two public re-exports (`src/model/index.ts:100`, `src/api/index.ts:246`).
- `envelopeOfSegments` throws on an empty array with a message naming the retired invariant — *"every stored Entry keeps at least one"* (`src/time/instant.ts:59`). The guard at `entry-reader.ts:222` keeps the call from reaching it, so the throw stays; the message must stop citing a dead rule.
- ADR 0012 needs a revision note. The biconditional is dead, and ADR 0006's rule applies: the new ADR carries the revision, and 0012 is not edited in place.
- `plans/02-public-api.md:120` and `:230` state the retired rule twice.
- Two tests assert the throw, one by name: `src/data/entry-reader.test.ts:245` and `src/data/entry-store.mutation.test.ts:123` ("ADR 0012 Gate").

---

## Q2 — what does removing the last authored Segment leave?

**Raised 2026-09-16, in the plan. B2. RULED the same day: it un-dates the Entry, and the dateless row stays in the grid. Today's rule holds, unchanged.** The door stays `dataset.entries.removeSegments` (Q13).

Today `removeSegments` on the last Segment un-dates the Entry (`CONTEXT.md:67`, ADR 0012's *last-segment-remove un-dates both dates*). Under #421 the dates are what make a bar, and the Segments are pieces of it.

**The ruling.** Removing the last authored Segment un-dates the Entry. The row keeps its place in the grid with empty date cells. `entries.remove(id)` is still the call that deletes a row. Two intents, two calls (ADR 0012).

**Why, in one line.** The dates of a segmented Entry **are** their envelope (`entry-reader.ts:222`). Remove the last Segment and the envelope has no source, so the dates go with it. Nothing is derived from nothing.

**Q1 and Q2 now agree, and the plan's earlier worry is void.** The plan warned that two doors could reach `segments: []` and disagree about the dates. They do not. `update(id, { segments: [] })` and `removeSegments(lastId)` both leave the row dateless, because both remove the same source. A caller that wants a plain bar names the dates in the same edit (Q1).

**What B2 must change.** `#removeSegmentsFrom` (`data/entry-store.ts:720`) already takes the un-date branch when nothing remains, and S3 measured it working for a plain bar with **no code change**. The one addition is the plain bar's own id: `removeSegments([plainBarId])` un-dates, because that id names the whole bar.

---

## Q3 — does `entries.addSegment(entryId, input)` ship beside `updateSegment`?

**Stands, 2026-09-17 (Q13).** Q10 briefly moved this door to `dataset.segments.add`. Q13 moved it back: `addSegment` ships on `dataset.entries`, as ruled below.

**Raised 2026-09-16, in the plan. B3. RULED the same day: yes, it ships in B3.** The first recommendation was "not in this issue", on scope alone. The author asked why, and the scope reason did not hold. It stands here as the record.

#421 names `updateSegment` and keeps the positional `update(id, { segments })` as the structural door. Adding one day to a request then reads `update(id, { segments: [...entry.segments.map((s) => s.toInput()), { start, end }] })`.

**Why it ships now.**
- The positional form makes the consumer rebuild the array to add one piece. That is the consumer re-deriving what the store holds, which is the stop rule's smell. B7's "add a day" story would log it as an API gap mid-build.
- The positional door is fragile for this job. `toInput()` omits Segment ids, so the write keeps ids by index. Append works. A reorder swaps ids under the Selection.
- `removeSegments` exists and `updateSegment` ships in B3. Remove and change with no add is a lopsided surface.
- The labour brief adds days to a request as a first-class action.

**Shape.** `entries.addSegment(entryId, input): Segment`. Singular, like `updateSegment`. Reads through `toSegment`, mints or takes the id, refuses a duplicate id as `add` does, writes one structural `segments` row (J-plan-3), returns the live `Segment`. On a plain Entry it drops the plain bar's id and the new Segment's id names the bar. Recorded as J-plan-8 in the README.

---

## J1 — S1's ChangeSet address: no `segmentId` row today, and a second write path is real but small

**Ruled 2026-09-16, from the S1 spike (`SPIKE-FINDINGS.md`).** **Shape superseded 2026-09-17 by Q6:** there is no `FieldUpdated.segmentId`. A Segment write is a `store: 'segments'` row keyed by the Segment's own id. The measurement below stands: the apply path is small, and undo needs no change.

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

**Ruled 2026-09-16, from the S2 spike (`SPIKE-FINDINGS.md`).**

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

**Ruled 2026-09-16, from the S3 spike (`SPIKE-FINDINGS.md`).**

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

**Status: ruled.** The author took C in the grill, and confirmed it on 2026-09-17. **Q10–Q13 changed five details of the sketch below:** the name is `Segment`, not `pieces` (Q10); the write doors are `entries.updateSegment`/`addSegment`/`removeSegments`, not one collection's `get`/`add`/`update`/`remove` (Q13); navigation is `segment.entry()`, not `row` (Q10); variants stay one `EntryVariant` with `whenSegment`, not two lists (Q11(a)); and the extender returns `DatasetEdits` (Q11(c)). Read Q10 for the shape, and this section for the reasons.

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
3. **A plain row's Segment is backed by the Entry.** The plain row stores `segments: []`. Its live Segment has a minted id and reads and writes the Entry's own record. A write through `dataset.segments` lands as `store: 'entries'` rows. The minted id stays out of every ChangeSet row (J-plan-1). This is not a read fallthrough (Q7): the plain Segment has no values of its own to fall through from.
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
