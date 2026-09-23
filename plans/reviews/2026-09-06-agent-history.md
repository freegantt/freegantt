# Agent history — the 2026-09-06 issue wave

Written for a later reviewer who did not watch this happen. One entry per dispatched agent, in
order. Each says what it was told, what it decided, and what it refused. The wave's status board
is deleted: every issue it tracked is closed except #222 and #242, which
`plans/issue-triage-2026-09-22.md` carries. This file is the *why*.

**Coordination shape.** Two implementation lanes at a time, never more. Each lane works in its own
git worktree (`wt-data`, `wt-frame`) beside the primary tree, so no two agents share an index or a
`pnpm verify`. A lane branches from `s5-start`, commits on its own branch, and never merges or
pushes. The coordinator rebases each branch onto `s5-start`, runs `pnpm verify` on the **combined**
tree, and only then merges and closes the issue. Lanes green alone are not lanes green together.

`upper-crab` is a shared clone: peer sessions edit the same working tree. Uncommitted changes that
are not this session's work are left alone unless the repo owner asks otherwise.

---

## Lane F1 — #228, the focus trap

Killed mid-flight by an HTTP 429. It had committed its work first, which is the only reason it
survived: the commit was rebased onto the peer's newer `s5-start` and merged.

**Decided:** the fix belongs on the focus trap, not on the popup's arming order. `preventScroll:
true` at all three `.focus()` sites, because a focus move the library makes on the user's behalf is
not a user scroll *at any call site*. Deleting `e2e/selection.spec.ts`'s workaround was the
acceptance test.

## Lane E — #210, #234, #237

**#210.** Took shape B: `Refusable` puts `refuse(reason)` on the payload, returning `false`, so the
boolean keeps its meaning and the words ride beside it. Placed on exactly the three `before*` events
whose veto core reports, and no others — an event that raises no report has nowhere to carry the
words. `RefusalNote` keeps the **first** reason only; two are never joined, because a joined string
reads like one author said both.

**#234.** Two reports on a vetoed cell commit, deliberately. This reversed the coordinator's earlier
recommendation, which had rested on a false premise: `MutationCancelledError` carries the whole
`ChangeSet`, so core's report never lacked locality. The repo owner challenged that premise directly
and was right.

**#237.** Swept the messages; **refused** to restructure `InvalidInstantError`, because two fault
families share the class and splitting it is a public-surface decision. Filed as #242 rather than
decided in a sweep.

**Refused, correctly:** the `lock-entries.ts` half of #210, because another lane held that file.
Reported it instead of working around it.

## Lane F2 — #226, #241

**#226.** `Gantt` became generic over the two parameters `Dataset` already takes, so `gantt.dataset`
returns the caller's own Dataset. **Getter only** — the agent checked and found the issue's premise
wrong: a Dataset is *not* already swappable, because `GanttShell` seeds its viewport, subscribes to
`change`, and hands the Dataset to every plugin and command context, all at construction. It
documented the absent setter so it does not read as an oversight.

**Refused:** `harness/main.ts`'s `window.__dataset` cast. The getter does not close it and could
not — that mismatch is between two harness pages declaring different field shapes against one shared
`Window`, not between a Gantt and its Dataset. It corrected the comment instead of deleting the cast.

**#241.** The lock demo cascades with `moveEntryTo`. The e2e guard was checked red first, and reads
the bar count off the page rather than asserting `3`.

## Lane F3 — #232

Given the repo owner's follow-up comment as the specification, not the issue body. Built all three
parts of the stated fallback, none skipped: a separate author-stated key set for I4, one merge
reconciled and diffed **once**, and a preserved refusal for a genuine cross-author envelope conflict.

**The instruction that mattered:** a guard-only change was forbidden, because narrowing I4 alone
would have shipped the duplicate-changeset-row defect the false positive was hiding.

**Refused, as instructed:** it did not move *when* `entries.update()` reconciles, or when a consumer
sees `SegmentsOutOfSyncError`. That timing is consumer-visible and was reserved for the repo owner.

**Verified by the coordinator, not taken on trust:** `diffEdits` now runs once over the merged map
(`build-commit-change-set.ts:273`); the two separate calls are gone.

## Lane A — #230 R3, R4, R5 (in flight)

Given the plan as its specification, with the warning that the plan's own status line ("R0 landed.
R1 is next") is two slices stale — trust `git log`, not the header.

Told mid-flight that §11's unverified judgement **was tested and came back negative** (see #243
below), because R5 adds `segmentIds` to `FrameRow` and reads them from the cache in question.
Instructed not to fix it, not to widen R5, and to stop and report if R5 cannot be written correctly
without it.

## Lane B — the refusal-sentence framer, then #240 (in flight)

For #240 the instruction is explicitly **measure before you fix**. `resizeEdit` already clamps to a
zero-length span, so the edit it produces cannot invert; something between that clamp and the commit
moves the edge. Guessing at the clamp would have produced a plausible wrong fix.

---

## What the coordinator did directly

Small, verified fixes that did not need a lane:

- **The three "fix now" findings** from the 24h branch review (`c96bee1`). The dead conditionals in
  `gesture-pipeline.ts` looked like discriminated-union narrowing, so they were proved twice: removing
  them typechecks, **and** a deliberately mismatched event/payload pairing still fails to typecheck
  without them. The narrowing was never load-bearing.
- **Five stale `moveEntryTo` records** teaching a signature the code no longer had. A plugin author
  following the glossary got a compile error.
- **The Stop-rule gap** (`0b344b3`): `lock-entries.ts` returns `refuse(reason)`, and the `onRefusal`
  callback plus three page-side handlers are deleted. The deletion is the proof the library closed
  the gap.
- **The `FieldKey` sweep**: four error classes typed `field` as `string` while `ErrorReport.field` is
  `FieldKey`.

## Claims that did not survive checking

Kept here so nobody re-files them.

- The 24h review's headline consumer gap — the toolbar's paired `dataset` argument — was **already
  closed by #226** on the day the review published.
- #239's issue premise was wrong: option A does not delete the composition trap. Verified against
  `reconcileEnvelope` and recorded on the issue.
- The context watcher exited 0 saying "every agent finished" while a subagent was still running.
  Exit 1 is trustworthy; exit 0 is a claim to check with `ListAgents`.

## Open trap, verified this session

**#243** — `FrameMemory` serves a stale packed cache when `datasetRevision` is omitted. The #230
plan flagged this as unverified in §11. It was tested directly and the stale read reproduced. Not
reachable through the public API (`api/dataset.ts:257` always returns a number); reachable through
the type system, because `model/dataset.ts:90` makes it optional. R1 put the Segment sets into that
cache and R5 will read them from it, which is why it is filed as `critical` rather than noted.

## Lane A's refusal, and what it cost

Lane A shipped R3, R4 and R5 and touched **no** doc file. It reported one refusal: it did not update
ADR 0010's "One layer answers 'which Segments does this stand for'" paragraph, calling that a
standalone open question outside its dispatch.

The refusal was wrong, and it was wider than the report said. The plan's §10 is a table of one record
edit per slice, and **three** of those edits went undone — not one:

| Owed by | Record | State when Lane A reported done |
|---|---|---|
| R3 | `CONTEXT.md`'s **DOM target** entry — both id sets come from one `FrameLayoutView` | not written |
| R4 | ADR 0010 line 98, and `plans/01` §8 — `SegmentSelection` owns the Selection | not written |
| R5 | `plans/01` §4 — `GeometryFrame`'s row carries `segmentIds` | not written |

ADR 0010 in particular still told a reader the Segment set was `FrameLayout`'s answer alone, three
commits after the frame started stating it on the bar and the row.

Fixed by the coordinator in `540242b`. `plans/01` §4 got `entryIds` beside `segmentIds`, because
`frame-row.ts` documents the two as one rule and half the pair teaches half a truth.

**Why this is worth recording.** A slice that ships code and defers its record is the same failure
D-S5-50 fixed earlier the same day, when five documents taught a `moveEntryTo` signature the code no
longer had. The plan anticipated the argument and pre-empted it: §11 says to draft the ADR wording
*inside* the R4 commit, precisely because the wording depends on names R4 invents. "It depends on my
work" was the reason to write it there, and the agent read it as the reason not to.

**The dispatch lesson.** The dispatch named the code and the completion test, and left §10 to the
plan file. `pnpm verify` passes on a record that contradicts the code, so nothing failed. A dispatch
that owns a slice must name that slice's doc edits in the prompt, or state that the coordinator will
write them.
