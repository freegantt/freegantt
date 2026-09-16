# A Segment is a bar — spike findings (#421)

Three throwaway probes, run once, then deleted. `git status` was clean before and after each one.
Every code line cited here was open and read at spike time, not taken from the plan.

---

## S1 — the ChangeSet address

**What ran.** `src/data/spike-s1.test.ts` (deleted). A two-Segment Entry (`d1`, `d2`).
`dataset.entries.update('req-1', { segments: [... , { ...d2, end: '2026-03-05' }] })`. The test read
the real committed `ChangeSet` off `dataset.on('change', ...)`.

**What happened.** Today's rows, in order:

```json
[
  { "store": "entries", "id": "req-1", "field": "end", "from": ..., "to": ... },
  { "store": "entries", "id": "req-1", "field": "segments", "from": [ ... ], "to": [ ... ] }
]
```

One `end` envelope row (the Entry's own span mirrors its Segments' union, `entry-reader.ts`'s
`reconcileEnvelope`), and one **whole-array** `segments` row. No `segmentId` row. No `color`-only
row. `d1` is copied unchanged into both `from` and `to` because the whole array is diffed as one
value (`data/change-set.ts#pushRow`, one row per Field key, not one row per array element).

**The answer to S1's question.** No — today's store cannot produce
`{ id, segmentId: 'd2', field: 'color' }` in any shape. Two static facts close the door before
runtime:

- `FieldUpdated` (`src/model/change-set.ts:20-25`) has `store`, `id`, `field`, `from`, `to`. No
  `segmentId` key exists on the type, so nothing can assign one — this is a compile-time gap, not a
  missing runtime branch.
- `applyFieldRow` (`src/data/entry-store.ts:72-84`) takes one `(field, value)` pair and either
  writes it through `writeOntoEntry` (a whole-Field write) or splices it onto the record. There is no
  path that opens one element of an array field and writes only that element.

**Named risk, confirmed.** `applyFieldRow` writes whole Fields. A per-Segment row needs a second
apply path. It also needs a second **diff** path: `diffEdit` (`src/data/change-set.ts:53-73`) walks
`registry.all`, reads `readField(current, field, access)` against the Entry, and emits one row per
Field key. A `segmentId`-addressed row needs the equivalent walk to read `segment.read(field)`
against one Segment, not the Entry — that is a second, parallel diff function, not a branch in the
first.

**Cost estimate, from reading the real code, not guessing.**
1. `FieldUpdated.segmentId?: SegmentId` — one field, `src/model/change-set.ts`.
2. A segment-scoped diff (mirrors `diffEdit`, reads `Segment.read` instead of `readField`).
3. A segment-scoped apply branch in `#applyUpdatedRows`/`applyFieldRow` (`entry-store.ts:937-946`),
   keyed on `row.segmentId !== undefined`: look up the owner via `entryIdOfSegment`, find the
   Segment in its `segments` array by id, write one field on a copy of it, splice it back.
4. `invertChangeSet` (`data/change-set.ts:150-156`) already swaps `from`/`to` generically per row —
   this needs no change, and undo-by-id falls out of it: the row still names `segmentId`, so replay
   finds the same Segment by id, never by array position.
5. **`EditRequest`/`ProposedEdit` do not see it either.** `EditRequest` (`model/stored-entry.ts:211`)
   carries `proposed: ProposedEdits`, a `Map<EntryId, ProposedEdit>` — Entry-granularity, one bag per
   Entry. A `ProposedEdit.segments` write is still a whole-array write at this layer. For
   `beforeChange`/`change`/`WriteRule` to see `segmentId`, the committed `ChangeSet` rows (point 1-3)
   are enough — those consumers read `ChangeSet.updated`, not `EditRequest`. But an `EditExtender`
   that wants to *propose* a one-field Segment edit has no vocabulary for it today; it can only
   propose a whole `segments` array. That is new surface, not a row-shape fix.

This is a real second path, not a big one: one type field, one new diff function, one new apply
branch. It is not a redesign of `applyFieldRow` itself — the existing whole-Field path is untouched
and keeps serving `segments`-array structural writes (J-plan-3's second row kind).

**What the build must change.** Matches the README's B3 sketch closely. One correction: the README's
"plus the Entry's `end` envelope row" undersells it — today's envelope mirror is not additive, it
**replaces** the whole-array row's necessity for date moves (see S3, which found and removed this
same mirror for the plain-bar case). B3 should decide explicitly whether `updateSegment('d2', {
end })` still produces an Entry-level `end` envelope row (today's behavior) or leaves the Entry's own
`start`/`end` untouched for a multi-Segment row (only the sole-Segment case really needs the Entry's
envelope to track). This is close to Q1/Q2's territory — logged as Q4 below.

---

## S2 — the handle pair

**What ran.** `src/view/spike-s2.test.ts` (deleted). Called the real, exported, pure
`projectAffordances` (`src/view/affordance-projection.ts`) with a two-Item entry and a `canGesture`
mock that differs by `edge`.

**What happened.**

- With `selectedSegmentCountOfSoleEntry: 1` (exactly one bar of the row is named in the Selection)
  and `canGesture('resize', id, 'end') === false`: `projectAffordances` returned
  `{ resizableEntryId: 'req-1', resizableEdges: { start: true, end: false } }`. The pair already
  brackets the Entry's envelope, already answers per edge, and already omits a handle whose edge
  refuses.
- With `selectedSegmentCountOfSoleEntry: 2` (both bars individually named, e.g. a grid-row click) and
  no hover: `projectAffordances` returned `{}` — no handles at all. This is intentional, documented
  behavior (`affordance-projection.ts:81-85`): a segmented row shows no handles until the pointer
  visits one bar.

**The answer to S2's question.** **Rule B is already the shape in production** —
`resolveResizableEntry` (`affordance-projection.ts:86-114`) never asks "which Item is this," it asks
"which Entry, and which edge." The pair always brackets the Entry's envelope (#200), and
`resolveEdges` (`:72-79`) already asks the two edges independently. The README's recommendation is
correct and needs no reversal.

**But the gating is not yet per-Item, and that is the real gap B5 must close.** `#canGesture`
(`src/view/gantt-shell.ts:1838-1841`) and `Capabilities.can` (`src/view/capability.ts:34-36`) both
take `(capability, entry, edge?)` — **no Segment, no Item.** `edge: 'start' | 'end'` is an *abstract*
distinction on the Entry (today it exists so one `Field`'s own per-edge write answer can close `end`
while leaving `start` open on a single-bar row, #142) — it is not "the Segment/Item that physically
sits at this edge." My probe's mock could fake a per-edge answer because `edge` is already a
parameter, but that coincidence only holds for a two-Segment row where the first Segment is the start
edge and the last is the end edge. It does not generalize: today's `resolveEdges` cannot ask "does
`d2`'s own `locked` prop refuse resize" — it can only ask "does `req-1`'s `end` edge refuse resize,"
with no way for a rule to differ by which Segment `end` happens to be attached to right now.

There is a second gap the README's line "each handle gated by the Item it lands on" undersells:
**hover does not thread the hovered Item into edge resolution either.** In
`resolveResizableEntry`'s hovered branch (`:102-106`), `hoveredItemId` narrows only *which Entry*
gets a turn; `resolveEdges(hoveredEntryId, canGesture)` then asks the same Entry-wide two edges
regardless of which of the row's bars is actually under the pointer. Hovering `d1`'s bar and
hovering `d2`'s bar produce identical `resizableEdges` today.

**Recommendation: B, with the mechanism the README already sketches** —
`resizeHandles: { start?: ItemId; end?: ItemId }`. Concretely: resolve the first and last `ItemId` of
the row from `itemIdsForEntry` (already available), and gate each independently through
`canGesture(item)` once `Capabilities.can`/`CapabilityRule` gain a `segment?` parameter (B5, already
planned). Hover keeps deciding which Entry's pair shows; it does not need to decide which bar's rule
answers — the edge-to-Item mapping is structural (first/last), not hover-dependent.

**I14 holds, and here is the concrete mechanism.** The same `canGesture(item)` call that decides
whether `resizeHandles.start`/`.end` is present (chrome) is the call the resize gesture's own start
must make before it begins dragging (`interaction/`'s resize handler, which already asks
`Capabilities.can('resize', ...)` per `view/capability.ts`'s doc comment: "one answer both hides a
handle and refuses the gesture"). No new resolution is invented; the existing one gains a parameter
both call sites read from the same Item.

---

## S3 — the plain bar's id

**This is the riskiest spike, and the probe required real (reverted) `src/` edits** — the plan
explicitly allows this for a spike. Touched: `src/data/entry-reader.ts` (`toSegments`,
`reconcileEnvelope`), `src/data/entry-store.ts` (new `#plainBarSegmentId` index). Both reverted with
`git checkout --` at the end; `git status` is clean.

**What ran.** `toSegments` changed to return `[]` for a spanning Entry with no authored Segments
(today it mints one and stores it). `reconcileEnvelope`'s sole-Segment mirror was narrowed to only
fire when a Segment already exists — a plain Entry's own date edit now leaves `segments` untouched at
`[]`. `EntryStore` gained `#plainBarSegmentId: Map<EntryId, SegmentId>` and
`#syncPlainBarSegment(entity)`, called after every committed add/update/restore (mirroring
`#rememberSegmentsOf`): mints an id once, keeps it while the entity spans with no authored Segments,
drops it otherwise. `entryIdOfSegment` needed no change — it already reads the same
`#entryIdBySegmentId` map this reuses. `segmentIdsOfEntries` needed one added branch to also report
the plain-bar id when `entry.segments` is empty.

**What happened, with real assertions** (`src/api/spike-s3.test.ts`, deleted, 5/5 passed):

- `entry.segments` is `[]` for a plain bar, and `segmentIdsOfEntries(['plain'])` still names exactly
  one id.
- A drag (`update('plain', { start, end })`) leaves that id unchanged:
  `before === after === 'sg1'`, and `entryIdOfSegment('sg1')` still answers `'plain'`.
- `dataset.undo()` after that drag leaves the id unchanged too — undo needed no special-casing,
  because the id was never in a ChangeSet row to begin with; there was nothing to invert.
- `removeSegments(['sg1'])` un-dates the plain bar (`start`/`end` both become `undefined`) with **no
  code change** to `#removeSegmentsFrom` — it already filters `entry.segments` (which starts empty)
  and takes the `remaining.length === 0` branch unconditionally for a plain bar, which is exactly
  "un-date."
- The Rollup case (a childless-until-now parent) **did not go through my changes at all.**
  `data/rollup.ts:180-189` mints and writes its own `segments` array row directly, independent of
  `toSegments`/`reconcileEnvelope`. The parent I built ended up with `segments: [{ id: 'sg2', ... }]`
  — one *authored-looking* array element, not the private-index id. This is a third code path the
  README's migration table already names correctly (`data/rollup.ts:180-186`) but it is worth
  stating plainly: **the Rollup's own mint-and-store-in-array behavior is untouched by anything in
  this spike and must get the same `#syncPlainBarSegment` treatment in B2**, not a variant of it.

**The answer to S3's question.** The id can stay stable across undo without a ChangeSet row — because
in this design nothing about it ever needs to be undone. It is not "state," it is a stable label the
store hands out once per spanning-and-unauthored entity and retires when that stops being true, the
same way `LiveEntries` hands out one `Entry` object per id for the store's life (ADR 0017). Undo,
redo and replay all operate on `StoredEntry`/`ChangeSet`, which never mention it — there is nothing
for them to get wrong.

**The real cost is not the index. It is everything that reads `entry.segments` expecting it to answer
`[1 element]` for a plain bar.** Running the existing suite against the reverted branch
(`pnpm vitest run src/data/ src/api/ src/layout/`) with only `toSegments`/`reconcileEnvelope`
changed — **not** touching `rollup.ts`, `layout/`, or `view/` at all — broke **37 tests across 8
files**: `entry-reader.test.ts`, `entry-store.mutation.test.ts`, `transaction.test.ts`,
`edit-extension.test.ts` (all `data/`, expected — these test the old mirror directly), plus
`layout/frame.test.ts`, `layout/frame-memory.test.ts` (exactly the two lines the README's table
names), **and `api/gantt.test.ts`, `api/dataset.test.ts`** — 20 of the 37 failures, covering real
drag, selection, keyboard-nudge and Delete-key end-to-end tests. That last group is new information:
the README's reader table lists `layout/frame-memory.ts:127,157` as the layout port to fix, but the
`gantt.test.ts` failures show `view/`'s own Selection and gesture-preview code (`segment-selection.ts`,
`gesture-draft.ts`, the drag/keyboard/Delete-key paths) also reads `entry.segments` directly and
expects a real array element for a plain bar — a wider surface than the two cited lines.

**No blocking finding.** The mechanism works, the id is provably stable, and no fallback to "a stored
record filtered on read" was needed anywhere in the probe — the opposite: the probe *removed* the one
place (`reconcileEnvelope`'s sole-Segment mirror, `entry-reader.ts:320-343`) that was, in effect,
already doing exactly that filtered-record trick for the drag/undo case. B2 is real, wide work (the
plan's own 59-reader estimate reads right, arguably low by the `gantt.test.ts` evidence above), but
it is not blocked and needs no design reversal.
