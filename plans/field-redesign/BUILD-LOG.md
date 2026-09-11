# Build log — questions and judgement calls

> **This file survives a crashed session.** Everything a build raises goes here, the moment it comes
> up. A question asked only in a chat window is lost when that window closes.

Three kinds of entry live here:

- **Q — a question for the author.** It waits for an answer. Nobody guesses it.
- **J — a judgement call an agent made alone.** The build did not stop, so the call is recorded for
  review. A reviewer can reverse it.
- **N — a note the build owes somewhere else.** An issue comment, a label, a follow-up.

**Write the entry before you continue.** Add the answer under the entry when it arrives. Never delete
an entry — mark it **ANSWERED**, **REVERSED**, or **DONE** and keep the text.

Settled rulings move to [`shared/rulings.md`](shared/rulings.md). Refused approaches move to
[`shared/refuted.md`](shared/refuted.md). This file holds what is still in motion.

---

## Open

### Q1 — Does #212's stale text get a note? — **ANSWERED: yes, and it is posted**

**Raised:** 2026-09-10, Build 0. **Answered:** 2026-09-11, by the author.

Issue #212 is **already closed** — 2026-09-06, `COMPLETED`, label `fixed needs review`. An earlier
coordinator note called it a close candidate. That note was wrong; no close was owed.

Checking the body turned up **two** superseded decisions, not one:

1. *"Deleting the last Segment deletes the Entry."* **Reversed by ADR 0012.** A dateless Entry is
   legal now, so the cascade is not needed to keep the store consistent. `removeSegments` on the last
   Segment clears both dates and keeps the Entry, its id and its descendants; `#reparentChildrenOf`
   is deleted. See J5.
2. *"the document goes to `schema: 4`."* **Retired by ADR 0016.** `SegmentId` stability stands;
   the schema half has nothing left to describe. Persisting Segment ids is the consumer's job.

[Comment posted](https://github.com/Pawel-IT/FreeGantt/issues/212#issuecomment-5635059776). The issue
stays closed. Nothing else in #212 changed — the two-part rule, the pane deciding the unit, and
`CommandTarget`'s two sets all stand.

### Q2 — Do Build 0's six commit trailers get rewritten? — **ANSWERED: no**

**Raised:** 2026-09-10. **Answered:** 2026-09-11, by the author. Leave them.

Build 0's six commits carry `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` instead of the
configured `Claude Opus 5 (1M context)`. The branch is pushed, so a rewrite would need a force-push,
and the trailer is wrong in a way that costs nothing. Builds 1 onward carry the correct trailer.

### Q4 — May the builds edit `plans/**` without asking each time? — **ANSWERED: yes**

**Raised and answered:** 2026-09-10, by the author.

A build that retires a rule must retire the sentence that states it, in the same change. The
checkpoint question in `.claude/hooks/protect-spec.sh` fired on work the author had already approved.

The author relaxed the `plans/**` arm for the length of the build-out. A `TEMPORARY`-marked block
near the top of the hook short-circuits it.

**The grant covers spec text the six ADRs already decided. It does not cover D1–D12.** A locked
decision still changes only by an explicit human decision. The `package.json` arm and the
guard-loosening arm were never relaxed — both still exit 2.

**The restore is owed.** It is tracked in [`CLOSE-OUT.md`](CLOSE-OUT.md).

---

## Judgement calls

### J1 — `reconcileEnvelope`'s `mintSegmentId` is optional; the drag preview passes none

**Raised:** 2026-09-10, Build 1 (ADR 0012). **Status:** standing, open to reversal.

`reconcileEnvelope` mints a Segment when an edit leaves an Entry with both dates for the first time.
The commit path (`toEditReading`, and `reconcileExtenderEdits` via a new `CommitChangeSetInput.
mintSegmentId`) always has a real counter to call. `view/gesture-pipeline.ts`'s preview path
(`reconcileExtenderEditsForPreview`) does not: `view/` has no door to the Dataset's id counter, and
opening one felt premature — I found no scenario in this build's own reach that needs it. Turning a
dateless Entry spanning mid-drag needs an `EditExtender` cascade to do it, and no such cascade exists
before S7's scheduling plugin.

**The call:** `reconcileEnvelope` takes `mintSegmentId` as optional. When it is missing and a Segment
would need minting, the function leaves the dates set with no Segment for that one preview frame —
never committed, so never a real inconsistency, only a frame that draws no ghost bar for an edge case
that cannot occur yet. A reviewer who later wires a cascade through view/ during S7 should re-open
this rather than assume the gap is permanent.

### J2 — `wholeEntryItem`'s signature is untouched; the span guard sits once in `produceItemsForRow`

**Raised:** 2026-09-10, Build 1 (ADR 0012). **Status:** standing, open to reversal.

An Entry that does not span draws no bar (ADR 0012). `wholeEntryItem` is public (`harness/plugins/
risk-kind.ts`, `buffer-kind.ts` both call it as `(entry) => [wholeEntryItem(entry)]`) and still takes
a plain `Entry`, unnarrowed. Rather than widen its signature or touch the two harness plugins — either
of which reaches into Build 4's plugin-surface redesign — `produceItemsForRow` now skips the producer
call entirely for a non-spanning Entry, before any producer (shipped or a plugin's own) ever runs.
`wholeEntryItem` and the two internal producers that still read `entry.start`/`entry.end` carry a
documented load-bearing cast, trusting that contract rather than the type. Build 4 owns whether the
public shape should change; this build does not preempt it.

### J3 — `rollup.ts` needs no change; the dateless-parent bar gap stays with Build 3

**Raised:** 2026-09-10, Build 1 (ADR 0012). **Status:** standing, informational.

`Entry.start`/`Entry.end`'s `rollUp: 'min'`/`'max'` Aggregator config already skips a non-spanning
child through `RollUpContext.numericValues`'s existing `isFiniteNumber` filter, so no `rollup.ts`
change was needed to keep a rolled-up parent's envelope correct with a dateless child in the mix. A
parent whose *every* child is dateless still gets no Segment and draws no bar even after Rollup
writes its `start`/`end` — ADR 0012 assigns that restoration to ADR 0013's Rollup pass explicitly
("this biconditional is what that pass must restore"), so this build leaves it alone.

### J4 — `previewOffsets`' envelope-only branch gets a defensive guard, not a cast

**Raised:** 2026-09-10, Build 1 (ADR 0012). **Status:** standing, open to reversal.

`layout/gesture-draft.ts`'s `pushOffset` reads `original.start`/`original.end` off a committed Entry
in its envelope-only branch (the `edit.segments === undefined` arm). Once `Entry.start`/`.end` are
optional this needs to type-check. A gesture that reaches this function already requires a grip to
grab, which ADR 0012 says a non-spanning Entry does not have — so in practice `original` should
always span here. Rather than assert that with a cast, this build added a plain early return
(`if (original.start === undefined || original.end === undefined) return;`), the same shape the
function already uses for `edit.start`/`edit.end`. Cheaper to verify, and it fails safe (paints no
offset) if the capability gate is ever wrong, instead of a runtime crash a cast would risk.

### J5 — `removeSegments` on the last Segment clears both dates instead of removing the Entry

**Raised:** 2026-09-11, Build 1 (ADR 0012). **Status:** standing, open to reversal.

`#212`/ADR 0010 had `removeSegments` delete an Entry once its last Segment was gone, reparenting its
children up to its own parent. ADR 0012 makes a dateless Entry legal, so that cascade is no longer
required to keep the store consistent. `entry-store.ts`'s `#removeSegmentsFrom` now calls
`this.update(id, { start: undefined, end: undefined })` in the empty-remainder case instead of
`stageRemove` + `#reparentChildrenOf` (the latter deleted outright, along with the `TxToken` parameter
it existed to carry). The Entry, its id, and its descendants all survive; only `entries.remove(id)`
deletes a row now. `freegantt.deleteSelection` (`view/core-commands.ts`) was rewritten to match: a
`'bar'` target still calls `removeSegments`, but a `'row'`/`'cell'`/`'header'`/`'splitter'` target now
calls `entries.remove(id)` directly, since the old "last Segment gone empties the row" side effect it
relied on is gone. `entry-store.mutation.test.ts` and `api/gantt.test.ts` were rewritten to match; the
old reparenting sub-tests were deleted, not adapted, since that behaviour no longer exists.

### J6 — The build's stub-list table is stale for two of its four rows; not applied

**Raised:** 2026-09-11, Build 1 (ADR 0012). **Status:** standing, informational — flag for the author.

`build-1-0012-optional-dates.md`'s stub-list table instructs dropping the `durationOf` key from the
`FieldContext` test stubs at `src/data/fields/field-types.test.ts:10` and `src/layout/rows/filter.
test.ts:78`. Per CLAUDE.md's rule that a plan's account of the code is a claim, I tried the edit and
ran `tsc --noEmit`: it fails with `TS2741: Property 'durationOf' is missing`. `durationOf` is a
still-required `FieldContext` member (`src/model/field.ts:191`, already correctly guarded per the
comment "`undefined` iff `entry` does not span (ADR 0012)"), so the table's instruction does not match
the current, already-correct implementation. Left both files unchanged. The table's third row
(`field-access.test.ts:75`, "rewrite the test against the guarded helper") was accurate and applied.

### J7 — Auto-`'group'`-kind promotion overrides a just-cleared parent's dates; expected, not a bug

**Raised:** 2026-09-11, Build 1 (ADR 0012). **Status:** informational, no code change.

An Entry with a child is auto-promoted to an effective `kind: 'group'` even when not authored that
way. `'group'` sits in the default `rollUpKinds`, so the Rollup pass re-derives that parent's
`start`/`end` from its children on every read, regardless of what a prior `update()` wrote. A test
asserting a childful parent's dates go `undefined` after `removeSegments` fails for this reason — the
child's date wins, correctly. `entry-store.mutation.test.ts`'s descendant-survival test was written to
assert only structure (the Entry and its child both survive) on the childful case, leaving the
dates-cleared assertion to the separate childless test. Worth recording so a future reader does not
re-derive this the hard way.

### J8 — `GanttShell.reveal()` needed a dateless-row branch; found and fixed in an earlier session

**Raised:** carried from an earlier session in this build, logged here 2026-09-11 (Build 1, ADR 0012).
**Status:** DONE — code and tests exist; this entry only records it.

`reveal(id)` for an Entry read `entry.start`/`entry.end` unconditionally and called `#revealSpan`,
which had no defined behaviour for a dateless Entry once ADR 0012 made that legal — no ADR or existing
rule covered what "reveal a row with no bar" should do. Fixed with a new `#revealRow` branch: a
dateless Entry moves the viewport's `y` to the row (scrolling it into vertical view) and leaves `x`
untouched (`width: 0` at the current `x` reads as already-visible to `Viewport.reveal`, the same
no-op-on-x idiom `#rovingFocusPorts`' own `revealRow` already uses). See `src/view/gantt-shell.ts`
around line 1706 (`reveal`) and 1724 (`#revealRow`).

### J9 — A roll-up parent's own Segment stays gone after Rollup restores its dates; two e2e tests updated, `rollup.ts` untouched

**Raised:** 2026-09-11, Build 1 (ADR 0012). **Status:** standing, matches J3, flagged for the author.

Before this build, every Entry carried at least one Segment, so a roll-up parent with no dates of
its own (e.g. a `'group'` whose span is entirely derived from its children) still held a synthetic
Segment, minted at ingest. ADR 0012 retires that fill: an Entry with no authored dates now stores
`segments: []`, correctly. The Rollup pass still writes the parent's derived `start`/`end` (S4.2,
unchanged), so the parent spans and draws a bar — but `rollup.ts`'s `widenSegmentsToEnvelope` only
widens an *existing* Segment set (`if (... parent.segments.length === 0) return parent;`, unchanged
from before this build); it never mints one from nothing. So a roll-up parent now spans, draws a bar,
and holds no Segment — a state ADR 0012's own rule ("holds a Segment ... iff it spans") does not
name, because minting a Segment for a Rollup-derived envelope is Rollup's own act, not an ingest-time
one. J3 already assigned exactly this restoration to ADR 0013's build. This build does not preempt it.

**The visible effect:** a `fg-bar-summary` (a roll-up parent's own bar) can no longer be selected by
a plain click — `FrameLayoutView.segmentIdsForItem` resolves through `entry.segments`, which is now
empty for that Entry, so a click on it proposes an empty Selection. `e2e/selection.spec.ts` already
knew this and skips `.fg-bar-summary` bars in its own bar-picking helpers, from an older commit
("the group bar's class says what it paints, not what it used to") — this is not new. Two other e2e
specs did not know it and broke: `e2e/data.spec.ts`'s `selectFirstBar` picked `.fg-bar` unfiltered,
which happened to land on a roll-up parent's summary bar first; fixed by excluding
`.fg-bar-summary`, the same filter `selection.spec.ts` already uses. `e2e/hierarchy.spec.ts`'s
`"Delete on a parent's last Segment removes the parent alone..."` test asserted the pre-ADR-0012
cascade outright (parent removed, child reparented); rewritten to assert the ADR 0012 outcome instead
(parent survives, child's `parentId` never changes) — the parent it deletes the last Segment of,
`task-alpha-1`, has a child of its own, so it is a roll-up parent already, and this same Segment gap
applies to it after the delete.

---

## Notes owed elsewhere

### N1 — #266 is raised, not closed — **DONE (comment posted)**

Build 0 found a two-way name collision on `Document`. Only the serialized-`Dataset` `Document` is
retired; the DOM one keeps the name. The comment is posted. The issue stays open for the author.

### N2 — Build 0 landed before this file existed — **a known gap**

Build 0 (ADR 0016) finished on 2026-09-10, and this log was created after it. Its judgement calls
were reported in a chat window and are not written down here. The coordinator verified its **result**
against the repo — the verdict line, the format grep, the ordering of `pluginStore` before the
deletions — but a call it made along the way may be unrecorded.

The end-of-redesign review reads Build 0's six commits with that in mind. Builds 1 to 5 write here as
they go, so the gap does not repeat.

### N3 — Build 3's file was missing the Segment restoration — **FIXED**

**Found:** 2026-09-11, by the coordinator, verifying Build 1's close-out.

J3 and J9 both defer the roll-up parent's Segment to ADR 0013, and ADR 0012 assigns it there in
writing. **Build 3's own work list did not carry it**, and neither did ADR 0013 — its single mention
of a Segment is about ingest. A build agent reads one build file and its ADR, so the item was
addressed to a reader who would never see it. The deferral would have quietly become a deletion, and
the branch would ship a summary bar no click can select.

Added to [`build/build-3-0013-derivation.md`](build/build-3-0013-derivation.md) as a work item and as
a named gate assertion.

**The lesson for every remaining build:** deferring work to a later build is not done when the log
records it. It is done when the *receiving build's file* carries it. A defer that lives only in a J
entry is a defer nobody receives.

### N4 — `harness/main.ts` naming residue — **carried to the review phase**

`#document-json` / `documentJson` and `#export-btn` / `exportBtn` survive in the harness. "Document"
is retired and nothing is exported any more. This is naming residue, not an API gap, so Build 0 did
not stop for it. The end-of-redesign review pass picks it up.
