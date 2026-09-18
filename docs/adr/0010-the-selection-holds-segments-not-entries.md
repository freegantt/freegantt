# The Selection holds Segments, not Entries

> **Superseded in full by [ADR 0025](0025-the-selection-holds-entries-not-segments.md)**, ruled
> 2026-09-17 (#421). `Segment` retires as a type: what this ADR calls a Segment is now an ordinary
> child `Entry`, with its own `EntryId`, so a `SegmentId` names nothing a consumer authored. The
> Selection holds `EntryId` again. **Do not rewrite the body.** It stays as the record of why the
> Selection moved to `SegmentId` in the first place, and that reasoning was sound for the type this
> library shipped at the time.

> **Vocabulary note, added 2026-09-17 ([#421](https://github.com/Pawel-IT/FreeGantt/issues/421)).** This record predates the `Item`→`Bar` rename ([ADR 0026](0026-the-segment-retires.md)). Read every `Item` below as `Bar`. **Do not rewrite the body.**

D-S3-10 fixed the Selection as a set of `EntryId`. Its premise was that "this Segment is selected but
its siblings are not" means nothing. `CONTEXT.md` said the same thing from the other side: "A Segment
is a unit of drawing only." **That premise is wrong, and this ADR reverses it. The Selection is a set
of `SegmentId`.**

The product already disagreed with itself. A click on one bar of a segmented Entry painted that one
bar (`paintsSelected`, `src/render/dom/index.ts`), because a user who points at one bar means one
bar. The Selection still held the whole Entry, so every action then acted on all three bars. The user
read the highlight, the highlight was wrong, and a right-click plus Delete removed work they never
picked (#212).

Five issues each answered "what does this act on?" for one operation, and the answers crossed twice
(#185, #198, #199, #200, #205, #211). One rule was missing. It has two halves.

**The pane picks the unit.** A click in the grid pane selects the whole row — every Segment of every
Entry that row owns. A click on the timeline selects the Segment under the pointer. Ctrl-click and
Shift-range collect Segments. This is a DOM fact, and `targetUnder` already owns it. Nothing
downstream asks the question again.

**The operation reads the set it needs.** `CommandTarget` carries `segmentIds` and `entryIds`.
`entryIds` is a projection of `segmentIds`: the Entries those Segments belong to, deduped, in row
order. Delete reads `segmentIds`. Lock reads `entryIds`, because a lock is a property of the record
and not of one drawing of it. Neither command declares anything, and the two can never disagree,
because both read one resolution.

**Every Entry stores at least one Segment.** Ingest fills one over `[start, end)` when the consumer
authors none. So a Segment is always there to select, and no caller carries a "this Entry draws no
Segment" branch.

**A Segment carries a stable id.** An index renumbers when a Segment goes. Delete the middle Segment
of three, and a Selection that holds index 2 lights the wrong bar. Undo it, and the mistake repeats.
The Document goes to `schema: 4`, and a reader of an older Document mints the ids it finds missing.

## Considered options

- **Keep the Selection on the Entry, and let the Picked Item say which bar the pointer grabbed
  (the status quo, D-S4-30).** Rejected. It is what shipped, and it is the defect. The pick told the
  paint one thing and the Selection told every action another, so each new action had to choose a
  side. #200, #185, #198, #205 and #211 are that choice, made five times, twice in opposite
  directions. Two established Gantt products do work this way, so the option is not absurd. One of
  them then rules that a gesture on the first part acts on the whole record. Nobody can guess that
  rule from the screen.
- **Make a Segment a real record, as one established Gantt product does.** Rejected. Segments would then need parents, ids in
  the Document, rows of their own, and a rule for what a "parent" Entry's dates mean. It moves a
  drawing concern into the authored record, and ADR 0003 keeps that line.
- **Key the Selection by segment index.** Rejected. An index is free, and it is wrong the first time a
  Segment is removed — see the stable-id paragraph above.
- **Let each operation declare how wide it reaches (`actsOn: 'segments' | 'entries'`).** Rejected
  after two rounds of specification. The pane already decides what the Selection holds, so a command
  does not need telling a second time. A declaration adds a state to describe, a default to argue
  about, and a way for two commands to disagree. Carrying both sets on the target costs one projection
  and removes the question.
- **Key `Item.id` by `SegmentId` instead of `${entryId}:${segmentIndex}`.** Rejected here, not
  forever. `plans/02` publishes that convention to plugin authors. `Item.id` is frame identity and
  `Segment.id` is stored identity: two jobs, both kept.
- **Let a last-Segment removal cascade to the whole subtree, matching `entries.remove(id)`
  (#212, fix plan R3).** Rejected. `entries.remove` is a consumer naming an `EntryId` and asking to
  delete that whole branch on purpose. `removeSegments` is a consumer naming Segments, and only
  incidentally empties an Entry when the last one goes. `Delete` binds to `removeSegments` by
  default, so a user pointing at one bar could delete an entire subtree with no warning and no way
  to tell from the screen that a subtree, not one bar, was at stake. Undo recovers the mistake, but
  recoverable is not the same as expected, and the surprise is the defect this slice closes.

## Consequences

- **`gantt.selectedIds` retires.** The name cannot say which unit it holds once two units exist.
  `gantt.selectedSegmentIds` is the Selection, and `gantt.selectedEntryIds` is derived from it. This
  library has never shipped, so no shim is written.
- **Selection events carry `SegmentId[]`.** `beforeSelectionChange` and `selectionChange` report
  `{ from, to }` over Segments.
- **A segment-level operation exists.** `dataset.entries.removeSegments(ids)` removes Segments in one
  transaction and one changeset, across several Entries when the ids name several.
- **An Entry never survives as an empty record.** Removing an Entry's last Segment removes the Entry,
  in the same transaction, so one undo step restores both with their ids unchanged. This is why a
  grid-row Delete needs no special case: the pane put every Segment of the row in the Selection, and
  the Entries went with their last Segments.
- **That removal never takes the Entry's descendants with it** (#212, fix plan R3). Each direct
  child re-parents to the removed Entry's own parent — or to the root, when it had none — in the
  same transaction, before the Entry is staged for removal. `entries.remove(id)` is the deliberate
  "delete this whole branch" call, and it still takes the subtree with it; a `Delete` keypress that
  happens to land on an Entry's last Segment is not that request, and a default key binding must
  never be able to make it by accident. The one undo step restores the Entry, its Segment, and every
  promoted child's original `parentId` together.
- **`segments-out-of-sync` narrows.** It refuses a `start`/`end` write that names no Segments only when
  the Entry draws several of them. One Segment is the envelope's own drawing, so it moves with the
  envelope, and an ordinary date cell edits as it always did.
- **The Picked Item is deleted.** It existed only because the Selection could not hold a Segment. The
  behaviour it bought is kept, and #211's tests are the net that proves it.
- **D-S4-30 survives its own mechanism.** *"What paints as selected is what moves"* is not reversed.
  It becomes true by construction, because the paint and the gesture now read one set.
- **A covered Segment still cannot be selected.** Overlapping Segments are valid data, and
  `elementFromPoint` returns the top bar only. This ADR does not close that, and no test here claims
  it does. Issue #215 tracks it, and issue #217 asks the lane question beside it.
- **The hot path keeps its budget (I5).** The selection diff runs over Segments instead of Entries. It
  stays O(what changed) and never scans every mounted bar.
- **One layer answers "which Segments does this stand for".** The pane rule stays on `targetUnder`, as
  above. The Segment set behind it is the layout's answer, asked for by the pointer path and the
  gesture path alike. #230 gave that answer two shapes for one cached record: the frame *states* it
  on the bar and the row (`FrameBar.segmentIds`, `FrameRow.segmentIds`), which is what the paint
  reads; `FrameLayout.segmentIdsForItem` and `segmentIdsForRow` answer the same fact as a lookup by
  id, which is what a caller holding only an id reads. Two shapes, one source. A rendered node's
  `data-segment-id` says which Segment a bar draws right now; it is not a second source for the set.
  Two sources disagreed once a removed Segment renumbered the bars, which is the same
  paint-versus-action split this ADR exists to close. `targetUnder`'s pointer memo carries the
  layout's frame count for the same reason: a bar keeps its `data-item-id` while the Segment under it
  changes, so no node stamp can tell the memo it went stale.
- **One module owns the Selection, and it is not the shell.** `view/segment-selection.ts` holds the
  Segment ids and the pane rule that decides what a pointer hit would add to them (#230 R4). Before
  it, `interaction/entry-gestures.ts` re-derived that rule with its own switch on hit kind — the
  second reading this ADR exists to stop. `interaction/` now asks `selectableSegmentsOf` and never
  answers it. `SegmentSelection` publishes `segmentIds` and `entryIds` on one object, which is the
  pair a Command's `ActedOn` already takes, so the gesture path and the Command path read one shape
  (#216 Q3).

Supersedes the premise of D-S3-10 (`plans/s3-direct-manipulation/s3.1-selection.md`) and the pick
clause of D-S4-30 (`plans/s4-hierarchy-and-rows/README.md`). Issue #212.
