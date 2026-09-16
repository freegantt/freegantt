# A Segment is a bar — build log (#421)

**Q** is a question for the author. It waits. **J** is a call an agent made alone, so a reviewer can find it and reverse it.

Write the entry the moment it comes up, not at the end. Check that one does not already exist before you open a second.

---

## Q1 — does `update(id, { segments: [] })` make an Entry plain?

**Raised 2026-09-16, in the plan. B2. RULED the same day, then CORRECTED the same day. Read the correction — the first ruling was wrong.**

Today it throws `EmptySegmentsError` (`data/entry-reader.ts:607`): under ADR 0012 a spanning Entry always held a Segment, so empty was illegal. Under #421 a spanning Entry with `segments: []` is the plain bar — the state every plain Entry stores.

**First ruling, wrong.** "`update(id, { segments: [] })` clears the authored Segments and keeps the Entry's dates, so the row draws one plain bar."

**The author refused it, and the code agrees with the author.** An Entry's dates are not stored beside its Segments. They **are** the Segments' envelope whenever Segments exist: `toEntry` reads `segments.length > 0 ? envelopeOfSegments(segments) : dates` (`entry-reader.ts:222`), and `reconcileEnvelope` recomputes the same value at `:355`. So clearing the Segments removes the only source those dates had. Keeping them would keep a stale span — the exact bug #212 finding 4 fixed, written down in `toEntry`'s own doc comment (`entry-reader.ts:205-211`).

**The corrected ruling.** `update(id, { segments: [] })` is **legal** and leaves the row **dateless**, unless the same edit names `start` and `end`. `EmptySegmentsError` retires, because empty is no longer illegal. It is simply not a span.

**How a consumer makes a plain bar from a segmented row:** `update(id, { segments: [], start, end })`. One edit names both the clearing and the span the row keeps. Nothing is derived from nothing.

**Two dating rules, one sentence each.** An Entry with no Segments keeps the dates it named, read straight (ADR 0012). An Entry with Segments takes their envelope. This is today's rule, and #421 does not change it.

**What B2 must change.**
- `EmptySegmentsError` retires — `src/model/errors.ts:370`, the throw at `src/data/entry-reader.ts:607`, and the two public re-exports (`src/model/index.ts:100`, `src/api/index.ts:246`).
- `envelopeOfSegments` throws on an empty array with a message naming the retired invariant — *"every stored Entry keeps at least one"* (`src/time/instant.ts:59`). The guard at `entry-reader.ts:222` keeps the call from reaching it, so the throw stays; the message must stop citing a dead rule.
- ADR 0012 needs a revision note. The biconditional is dead, and ADR 0006's rule applies: the new ADR carries the revision, and 0012 is not edited in place.
- `plans/02-public-api.md:120` and `:230` state the retired rule twice.
- Two tests assert the throw, one by name: `src/data/entry-reader.test.ts:245` and `src/data/entry-store.mutation.test.ts:123` ("ADR 0012 Gate").

**Why no reason held it back.** The error had one reason: ADR 0012's biconditional, *an Entry holds at least one Segment if and only if it spans* (`docs/adr/0012-dates-are-optional-on-every-kind.md`, §Consequences). #421 retires that rule, because a plain bar stores dates and `segments: []`. The reason goes with the rule. No ambiguity arrives: `segments: []` clears the pieces, and `{ start: undefined, end: undefined }` un-dates. Two verbs, two jobs.

**What B2 must change.**
- `EmptySegmentsError` retires — `src/model/errors.ts:370`, the throw at `src/data/entry-reader.ts:607`, and the two public re-exports (`src/model/index.ts:100`, `src/api/index.ts:246`).
- ADR 0012 needs a revision note. The biconditional is dead, and ADR 0006's rule applies: the new ADR carries the revision, and 0012 is not edited in place.
- `plans/02-public-api.md:120` and `:230` state the retired rule twice.
- Two tests assert the throw, one by name: `src/data/entry-reader.test.ts:245` and `src/data/entry-store.mutation.test.ts:123` ("ADR 0012 Gate").

---

## Q2 — what does removing the last authored Segment leave?

**Raised 2026-09-16, in the plan. B2. RULED the same day: it un-dates the Entry, and the dateless row stays in the grid. Today's rule holds, unchanged.**

Today `removeSegments` on the last Segment un-dates the Entry (`CONTEXT.md:67`, ADR 0012's *last-segment-remove un-dates both dates*). Under #421 the dates are what make a bar, and the Segments are pieces of it.

**The ruling.** Removing the last authored Segment un-dates the Entry. The row keeps its place in the grid with empty date cells. `entries.remove(id)` is still the call that deletes a row. Two intents, two calls (ADR 0012).

**Why, in one line.** The dates of a segmented Entry **are** their envelope (`entry-reader.ts:222`). Remove the last Segment and the envelope has no source, so the dates go with it. Nothing is derived from nothing.

**Q1 and Q2 now agree, and the plan's earlier worry is void.** The plan warned that two doors could reach `segments: []` and disagree about the dates. They do not. `update(id, { segments: [] })` and `removeSegments(lastId)` both leave the row dateless, because both remove the same source. A caller that wants a plain bar names the dates in the same edit (Q1).

**What B2 must change.** `#removeSegmentsFrom` (`data/entry-store.ts:720`) already takes the un-date branch when nothing remains, and S3 measured it working for a plain bar with **no code change**. The one addition is the plain bar's own id: `removeSegments([plainBarId])` un-dates, because that id names the whole bar.

---

## Q3 — does `entries.addSegment(entryId, input)` ship beside `updateSegment`?

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

**Ruled 2026-09-16, from the S1 spike (`SPIKE-FINDINGS.md`).**

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

**Raised 2026-09-16, from the S1 spike. RULED the same day: yes, it writes the row. The Entry's span is the Segments' envelope — the lowest `start` and the highest `end`.**

**The ruling, in the author's words:** "the row should be rolled up using min for start and max for end".

**This is what `envelopeOfSegments` already computes** (`src/time/instant.ts:56-68`): it walks the spans, keeps the lowest `start` and the highest `end`, and every write path calls it. So `updateSegment('d2', { end })` writes an Entry-level envelope row, and the value is that min/max over the row's Segments after the edit. B3 adds no new maths. It carries the existing envelope pass onto the new per-Segment write path.

**A naming trap, and B3 must not step in it.** The behaviour is a min/max fold, but **it is not the Rollup**. In this codebase the Rollup is the pass over an Entry's *children* (ADR 0013), and #421 states that no Aggregator ever runs over Segments. Same arithmetic, different pass, different inputs. Call this one the **envelope**, as `envelopeOfSegments` and `reconcileEnvelope` already do. One word covering both passes is the #7 *"chart"* failure a second time.

---

### The question as it was raised

**OPEN until the ruling above, 2026-09-16.**

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
