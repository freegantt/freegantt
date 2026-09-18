---
status: accepted — ruled 2026-09-17 by the author (Q17), out of [#421](https://github.com/Pawel-IT/FreeGantt/issues/421). Built in C3 and C6 of `plans/segment-is-a-bar/README.md`. Working material: `plans/segment-is-a-bar/SPIKE-FINDINGS.md`, `plans/segment-is-a-bar/BUILD-LOG.md` (Q17, Q19).
decided: the Selection holds `EntryId`, not `SegmentId`. `gantt.selectedSegmentIds` retires into `gantt.selectedEntryIds`, and `view/segment-selection.ts` retires into `view/entry-selection.ts`.
open: nothing.
---

# The Selection holds Entries, not Segments

**Reverses [0010](0010-the-selection-holds-segments-not-entries.md).** That ADR is superseded, not
rewritten — its body stays as it was written.

## Context

0010 ruled the Selection onto `SegmentId` because a `Segment` was a drawn piece of one Entry, with no
identity of its own before that ADR gave it a stable id. Selecting the whole Entry could not say
"this piece, not that one," so the Selection had to hold the finer unit.

[#421](https://github.com/Pawel-IT/FreeGantt/issues/421) removes the premise. **What 0010 called a
Segment is now an ordinary child `Entry`, with its own authored `EntryId`, its own `parentId`, and no
stored classification of its own** ([Q17](../../plans/segment-is-a-bar/BUILD-LOG.md), ruled
2026-09-17). A row source rule says which segmented parent draws its children on its own row; the
children themselves are Entries the store already indexes, reads, writes and undoes through the one
door every other Entry uses. `SegmentId` named a unit with no `EntryId` behind it. Once every piece a
Gantt draws is an Entry, `SegmentId` names nothing a consumer authored, and a Selection keyed on it
holds an id no `dataset.entries` door ever hands back.

**The spike found the cost of keeping two id spaces before the ADR was written.** S4 audited every
site that assumes a row's drawn units and the Selection's held units are the same list
(`SPIKE-FINDINGS.md`, Q9). Nine sites read `entryIds[0]` across seven files. Seven of them ask "the
row's subject," and two ask "the first selected Entry" — `gantt-shell.ts:1480` and
`segment-selection.ts:170`, `SegmentSelection.step()`. With several child Entries selected on one
segmented row, `step()` read only the first of the nine and moved it, leaving the rest of the
Selection's own members untouched by the same keyboard gesture that had just moved one of them. C3
fixed the nine sites as one audit (`999f599`), and this ADR is why the fix reads "Entries," not
"Segments," on the far side of it: the unit a keyboard command steps and the unit a Selection holds
are now the same `EntryId`, because there is no second id to disagree with it.

## Decision

**The Selection is a set of `EntryId`.** `gantt.selectedEntryIds` replaces
`gantt.selectedSegmentIds`. `beforeSelectionChange` and `selectionChange` report `{ from, to }` over
Entries. `view/entry-selection.ts` replaces `view/segment-selection.ts`, holding the same two jobs
0010 gave the module it replaces: the ids themselves, and the pane rule that decides what a pointer
hit adds to them.

**The pane rule is unchanged in shape, narrowed in unit.** A click in the grid pane still selects
every Entry the row owns — the row's subject and, on a segmented row, every child it draws as a bar.
A click on the timeline still selects the one Entry under the pointer. Ctrl-click and shift-range
still collect Entries the same way they collected Segments. `targetUnder` still owns the question,
and nothing downstream asks it twice.

**`CommandTarget` keeps one set, not two.** 0010 gave a command both `segmentIds` and a derived
`entryIds`, because a Segment and its owning Entry were different things a command might need
separately — Delete read the finer unit, Lock read the coarser one. There is no finer unit left. A
command reads `entryIds` alone, and `entries.remove(id)` is the one removal door: an Entry that was
a Segment removes the same way an Entry that was never drawn as one does.

## Consequences

- **`SegmentId`, `Item.segmentId`, `FrameBar.segmentIds`, `FrameRow.segmentIds`,
  `selectableSegmentsInRowOrder` and the `data-segment-id` stamp retire with the type** ADR 0026
  retires. This ADR does not retire them on its own; it states the Selection's new unit, and
  [0026](0026-the-segment-retires.md) states the removal.
- **The Picked Item, which 0010 deleted, stays deleted.** It existed only because the Selection could
  not hold a Segment. Nothing in this reversal brings it back: an Entry was always a unit the
  Selection could hold, so the pick-versus-select split 0010 closed does not reopen.
- **"What paints as selected is what moves" still holds, for the same reason 0010 gave it.** The
  paint and the gesture read one set, and that set is now `EntryId` end to end — the frame's
  `FrameBar` carries the Entry id it draws, the pane rule adds Entry ids, and the diff that decides
  what repaints runs over Entry ids.
- **The hot path keeps its budget (I5).** The selection diff runs over Entries instead of Segments,
  and it stays O(what changed).
- **A rolled-up Entry is not a special case.** 0010 needed one, because an Entry with no Segment of
  its own could not be selected by clicking its bar — it drew none. A segmented parent draws no bar of
  its own either ([Q26](../../plans/segment-is-a-bar/BUILD-LOG.md)), and it needs none: its row
  click still selects every child Entry the row shows, through the same pane rule that already reads
  a row's Entry list.
- **Undo is unaffected.** The Selection was never part of a `ChangeSet`, under either ADR. What
  changes is which id space a consumer reads back from `beforeSelectionChange`.

Supersedes [0010](0010-the-selection-holds-segments-not-entries.md) in full. Its premise — that a
drawn piece needs an id space of its own because it has no `EntryId` — no longer holds once every
drawn piece is an Entry. Issue [#421](https://github.com/Pawel-IT/FreeGantt/issues/421).
