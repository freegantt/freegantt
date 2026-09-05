# Handoff — selection paint and drag granularity (#185, #200), and what they left open

**Written:** 2026-09-05 · **Branch:** `s5-start` · **Gate at handoff:** `pnpm verify` exit 0 and `pnpm test:e2e` 69/69, both re-run on the merge commit `b1233f7`, not only on the source branch.

Read `CLAUDE.md` first. It overrides your defaults.

Read [`handoff-post-163-review.md`](./handoff-post-163-review.md) second. It carries the shared-clone working rules, the #203 hazard as a daily practice, and the whole of #199. This document does not repeat any of that.

## 1. What landed

> **Superseded (#211).** The #200 subsection below — "what you selected is what moves" widened to
> "a drag moves the whole Entry, always" — over-corrected: paint (#185) still narrows to the one bar
> the pointer picked, and #200's drag no longer matched it. `plans/s5-extensibility-and-editing/spec-211-gesture-units.md`
> withdraws #200's amendment to D-S4-30 and restores the pick-gated per-Segment gesture. The text
> below is left as written, for history; it does not describe current behaviour.

Two issues closed the same contradiction from opposite ends. Selection is a set of **Entry** ids (D-S3-10). Paint and gestures both used to work in **Item** ids. The two disagreed, and each disagreement showed as a different bug.

### #185 — a selected Entry paints every bar it drew (`b819a2a`)

`InteractionState.selectedItemIds` is retired. The Selection reaches a backend as `selectedEntryIds`, and the backend resolves which bars those Entries drew from the frame it synced (`itemIdsByEntryId`, built in `syncBars`). Five sites that built an Item id out of an Entry id are gone.

Three defects died with it: a grid-row click painted Segment 0 alone; a bar that remounted after a scroll came back unpainted; and a row that owned several Entries could reach only the first.

New shapes to know: `FrameRow.entryIds` is plural, `HitResult` is `BarHit | RowHit`, `EntryGestureContext.entriesForRow` answers which Entries a row click selects, and `InteractionState.pickedItemId` is the one bar the pointer last picked.

### #200 — a drag moves the whole Entry the Selection names (`b1233f7`)

#185 made the second half visible. The Selection said the whole Entry was selected, and a drag moved one Segment of it.

**The repo owner decided: what you selected is what moves.** A drag steps every Segment by one delta and rewrites the envelope. A resize drags the Entry's envelope edge. **A gesture on one Segment alone is not offered here** — not hidden behind a modifier or a capability, simply not this decision's shape. Moving one Segment stays reachable through `entries.update(id, { segments })`. (#211 later reopened exactly this and restored it, gated on the pointer's own pick — see the superseding note above.)

D-S4-30 is amended to say so. Its old text said the opposite in so many words.

`InteractionState.resizableItemId` became `resizableEntryId`. State names the Entry, and the backend brackets it: leftmost bar for `start`, rightmost for `end`. This is the same shape #185 gave `selectedEntryIds`, on purpose — the two read as one idea.

**One trap that cost a commit to find.** A stored envelope is not always the Segments' envelope. The `segmented` fixture has a date-only `end`, so its stored `end` sits a day past its latest Segment. Both drafts therefore anchor on the Segments' own envelope, never on stored `start`/`end` (`75652bf`). A resize on such an entry repairs the envelope on commit. Read that commit before you touch drag anchoring.

## 2. Open, specified, and not started

### #198 — `canSelect` builds an Item id from an Entry id

The sixth guess site. #185's list did not name it, so it survived.

`src/interaction/entry-gestures.ts:115` does `ctx.entryFor(itemId(id))`. `entryIdOfItem(itemId(id, 0))` returns `id` again, so it is correct today and produces no defect. It is dead weight that reads as if Item ids and Entry ids convert freely — the belief #185 spent four commits removing. Its one caller filters a list that `selectableEntriesInRowOrder()` has already capability-filtered, so the filter is redundant too.

Delete `canSelect`, let `selectRange` return the slice unfiltered, then check whether `itemId` is still imported in that file at all. The test fake in `entry-gestures.test.ts` is what keeps it alive: it answers `entryFor` from an Item-keyed map. Make the fake answer "is this Entry selectable", which is the question the shell answers.

**Do not** replace the filter with a second capability call. The capability resolves once, in the shell (I14).

Blast radius: one function, one caller, one test fake. Labelled `quickie`.

### #203 — the pre-commit hook widens commits, and nobody has fixed it

**This is the one that costs someone a debugging session, and it is the one I deliberately did not do.**

`.githooks/pre-commit:8-14` runs `prettier --write` on staged files, then `git add -- $staged_all`, which re-stages each file **whole**. A partially staged file commits the hunks its author left out. It already happened: `07d76ed` carries a #197 spec paragraph by a different author, under a commit message about #159 error reporting.

The issue carries a tested fix — NUL-delimited sets, an intersection warning, `--` before prettier's file list. It is not applied. **Changing a shared guard hook is not something an agent should do on another agent's say-so**, which is why two sessions each wrote it up and neither acted. It needs the repo owner to say go.

The issue also carries the measured hook table: an automatic `git merge` runs `pre-merge-commit` (which this repo does not have), while `--no-ff --no-commit` and any conflicted merge finished by hand run `pre-commit` and are fully exposed. Those are the merges a careful person makes.

Until it is fixed, the practice is in [`handoff-post-163-review.md`](./handoff-post-163-review.md) §1: explicit pathspecs, and check `git show --stat <sha>` after every commit rather than the index before it.

## 3. Two follow-ups that need a person, not an agent

- **#198 has no kind label.** Nothing in the repo's set fits. It is not a bug, since nothing misbehaves; not an enhancement; not documentation. Only `quickie` is applied, and that is an effort label. Either a code-health label gets created or the issue stays as it is.
- **`plans/00-overview.md` has been modified and unstaged in the shared clone all day.** One line on the S6 → S7 gate row, about #197 extender composition. Four sessions have disclaimed it. It is exposed to exactly the #203 sweep described above. Somebody should claim it or revert it.

## 4. Not mine, do not assume

`#199` is decided and unblocked, and [`handoff-post-163-review.md`](./handoff-post-163-review.md) §2 carries the whole job. I filed the issue and wrote none of the code.

`plans/s3-direct-manipulation/*` and the archived review HTML still name `selectedItemIds` and `resizableItemId`. They are historical records of what was decided then. Both were left alone on purpose. Do not sweep them into a rename.
