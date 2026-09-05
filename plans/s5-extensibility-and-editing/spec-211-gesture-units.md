# Spec — what a pointer gesture acts on (#211, #185, #199, #200, #205)

**Written:** 2026-09-05 · **Branch:** `s5-start` · **Decides:** the unit question five issues asked
separately · **Supersedes:** the #200 amendment to D-S4-30

Read `CLAUDE.md` first. It overrides your defaults.

## 1. Why this document exists

Five issues (#185, #198, #199, #200, #205) all asked one question — *what unit does a pointer
gesture act on?* — and each got its own answer. Two of those answers crossed:

| Time | Commit | What it set |
| --- | --- | --- |
| 10:07 | `b78e781` | a bar click paints **every** bar of the Entry |
| 11:06 | `d32fc37` | a drag moves **every** Segment (segment drag deleted, D-S4-30 rewritten) |
| 12:52 | `b6cec45` | a bar click paints **the one bar** it named |

The drag was widened to match a paint that was then narrowed again. What ships today is the
inversion: **you click one bar, one bar lights up, and three bars move.** That is #211.

`b6cec45`'s own message records the contradiction it left behind: "a drag on any bar still moves
every Segment of the Entry (#200)".

## 2. The rule

> **What paints as selected is what moves, and what a menu acts on.**

Stated so it has no exceptions: **a gesture acts on exactly the set of bars that paint selected.**
Every row of the table in §4 is that one sentence applied to a different selection state. If you
find a case the table does not cover, resolve it with this sentence rather than inventing a rule.

This is the desktop selection model, unchanged since Windows 95 File Manager. It is not negotiable
per-feature. The repo owner restated it on 2026-09-05: *"If you select something you want to move
the selection. Moving a single thing should move a single thing. Right click should apply to what
you expect it to apply to."*

## 3. What stays

- **D-S3-10 stands.** The Selection is a set of **Entry** ids. Nothing here reopens it.
- **D-S3-19 stands.** A multi-Entry drag moves every selected Entry as one rigid group.
- **#185's two real fixes stand.** A remounted bar repaints, and a row that owns several Entries
  reaches all of them.
- **#199 and #205 stand.** A row target names every Entry the row owns; a right-click inside the
  Selection acts on the Selection.
- **The Picked Item stands.** `InteractionState.pickedItemIdByEntryId` already carries "the one bar
  the pointer named, per Entry", and `render/dom` already narrows paint to it. **No new state is
  needed.** This spec makes the gesture side read what the paint side already reads.

## 4. The decision table

A selected Entry is **picked** when `pickedItemIdByEntryId` names one of its bars. Picks are
per-Entry: a plain click leaves exactly one, a ctrl-click adds one per toggled Entry, and a
row click, a shift-range, a keyboard select and `gantt.selectedIds = [...]` name no bar at all.

| Gesture | Selection state | Acts on |
| --- | --- | --- |
| Click a bar | — | Selection becomes that bar's Entry; **that bar is the pick** |
| Click a grid row | — | Selection becomes every Entry the row owns; **no pick** |
| Ctrl/⌘-click a bar | — | toggles that Entry; **that bar becomes that Entry's pick** (picks are per-Entry) |
| Shift-click | — | ranges over whole Entries; **clears the pick** |
| Click empty timeline | — | clears the Selection |
| **Move drag** | one Entry, picked | **that Segment only** — writes `segments`, envelope follows |
| **Move drag** | one Entry, no pick | every Segment + the envelope |
| **Move drag** | several Entries | one rigid group (D-S3-19). Each selected Entry contributes **its own picked Segment** if it has a pick, and **every Segment** if it does not |
| **Move drag** | grabbed bar not in the Selection | Selection first becomes that Entry with that pick, then row 1 above applies |
| **Resize** | one Entry, picked | handles sit on **the picked bar**; writes that Segment's edge |
| **Resize** | one Entry, no pick | handles bracket the envelope: `start` on the earliest bar, `end` on the latest |
| **Resize** | several Entries | same delta on each Entry's picked Segment edge if it has a pick, else its envelope edge (D-S3-19) |
| **Keyboard nudge** | any | moves exactly what a drag in the same state would move |
| **Right-click / Shift+F10 inside the Selection** | — | the menu acts on the whole Selection; the Selection does not change |
| **Right-click outside the Selection** | — | Selection becomes that bar's Entry with that pick, then the menu acts on it |
| **Right-click empty timeline** | — | clears, then a background menu |

Read the three move rows aloud as a user: *"I clicked one bar, so one bar moves. I clicked the row,
so the whole thing moves. I selected three things, so three things move."*

## 5. What changes in code

Paint is already correct. The gesture side is the whole job.

1. **`src/layout/gesture-draft.ts`** — restore the per-Segment branches in `moveEdit` and
   `stepMoveEdit` from `d32fc37`. **One deviation from the recovered code:** the old shape carried a
   single `grabbedSegmentIndex` and applied it to `entries[0]` alone. Picks are per-Entry
   (`pickedItemIdByEntryId` already is), so `DraftInput` takes a `ReadonlyMap<EntryId, number>` of
   picked Segment indices instead. An Entry absent from the map moves whole. This is what makes the
   §2 rule exceptionless across a ctrl-click multi-selection. The envelope is rewritten in the same `StoredEdit`
   (a `start`/`end` write on a segmented entry is refused — see the **Segment** glossary entry).
2. **`src/view/gesture-pipeline.ts`** — `session()` currently asks the grabbed Item for a Segment
   index only when `gesture.kind === 'resize'`. It must ask for a **move** too, per-Entry. Take the
   pick from the same source the paint reads.
3. **Resize handles** — `resizableEntryId` parks the pair on the envelope. When the Entry it names
   has a pick, the pair brackets **that bar**. Keep the envelope behaviour for the no-pick case.
4. **`e2e/hierarchy.spec.ts`** — `d32fc37` renamed `'a segment drag moves one bar and Undo restores
   it'` into its opposite. Restore the original assertion and **keep** the whole-entry test for the
   row-click case. Both behaviours ship; both get a test.
5. **Docs that currently state the deleted behaviour as law:**
   - `CONTEXT.md` **Segment** — "It is never a unit of selection and never a unit of a gesture (#200)"
     is now false for gestures. A Segment is still never a unit of *selection*; it **is** the unit of
     a gesture when the pointer picked it. Rewrite that sentence, keep the selection half.
   - `plans/s4-hierarchy-and-rows/README.md:234` and `:278` — the D-S4-30 row and the behaviour row.
   - `plans/s4-hierarchy-and-rows/s4.10-tree-and-lane-interaction.md:8` and `:102` — "Segment-level
     drag is dropped" is reversed.
   - `plans/s5-extensibility-and-editing/handoff-selection-and-drag.md` §1 — records a decision that
     is now withdrawn. Mark it superseded by this document; do not silently edit history.
   - `plans/02-public-api.md` — the gesture section, if it states the unit.

**D-S4-30 is restored to its original meaning and gains the pick rule.** Its #200 amendment is
withdrawn. Cite this document, not #200, wherever the amendment is named.

## 6. Out of scope

- **#206** (`targetUnder`'s memo is stamped by identity only) is a real bug in the same file family
  and a **separate** root cause. It needs a frame revision stamp, which is a design decision. Leave
  it open. Do not fold it in.
- Reopening D-S3-10, D-S3-19, or the Selection's type.

## 7. Done means

- `pnpm verify` exits 0 and `pnpm test:e2e` passes, both re-run on the merge commit.
- In the harness: `entry-16` draws three bars. Click the middle one — one bar lights, and dragging
  it moves that bar alone. Click the grid row — three bars light, and dragging any one moves all
  three. One Undo restores either.
- No document still says a Segment is never a unit of a gesture.
- `git grep -n "Segment-level drag is dropped"` returns nothing.
