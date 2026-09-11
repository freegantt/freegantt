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

### Q5 — Does `model/`'s types-only carve-out admit a small runtime helper?

**Raised:** 2026-09-11, by the coordinator, from the 2026-09-11 branch review. **Status:** open,
deferred by the author on 2026-09-11 — **do not decide this in a build.** Come back to it.

**Two review findings are blocked on this one ruling**, and neither can land without it.

- **F13.** ADR 0012's span invariant — *"an Entry spans iff both dates are present"* — has no home. It
  is restated as guard arithmetic at about ten sites across `data/`, `layout/` and `view/`, plus six
  *load-bearing cast* annotations that lean on a contract stated only in comments. Every new
  non-spanning case risks a missed restatement. The review's fix is one `spansOf(entry)` predicate in
  `model/entry.ts`.
- **F14.** The `ProposedEdit` brand seed (`__brand` / `props: {}` / `proposedKeys`) is inlined three
  times in `src/layout/gesture-draft.ts`, because `emptyProposedEdit()` lives in `data/` and
  `layout/` may not import it. Every future constructor of the brand must rediscover the seed keys.
  The review's fix is to move the seed next to the type in `model/`.

**Why it is a ruling and not a build decision.** `plans/01` §1.1 makes `model/` types only: zero
runtime beyond id/brand helpers and the `FreeGanttError` base. This is **lint-enforced**, not a
convention — `eslint/rules/model-is-types-only.cjs` holds a fixed allowlist and widens it for exactly
one file, `errors.ts` (D-S1.7-8). The review-fix agent tried F14, the rule rejected it, and the agent
correctly removed the file rather than force it.

**The two answers.**

1. **Widen the carve-out** to admit a pure predicate and a pure seed — both are total functions over
   their argument with no state and no dependency. One `spansOf` and one seed helper then serve
   `data/`, `layout/` and `view/` alike, and the allowlist grows by two named entries.
2. **Leave `model/` alone** and accept one named predicate per layer instead of free guard
   arithmetic. More code, three homes for one rule, and no rule is bent.

Both are defensible. The cost of 1 is that a types-only boundary stops being simply true. The cost of
2 is that ADR 0012's invariant stays homeless, which is what F13 says is already hurting.

**Nothing is blocked on this today.** F13 and F14 are the only claimants, both are recorded, and the
branch is green without them.

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

### J16 — A custom "look" (buffer/risk) is dispatched by trial, not by a stored classification; the four seams keep string keys but core only ever computes `'parent'`/`'leaf'` itself

**Raised:** 2026-09-11, Build 3 (ADR 0013). **Status:** standing, load-bearing for the item-producer
and capability seams — flagged for review given how much of D-S5-22's rewrite this settles.

`plans/01:771/776` already show the target shape: `registerItemProducer(look: 'parent' | 'leaf' |
(string & {}), producer)` and `registerLookDefaults(look, defaults)` — a plain string key, same shape
as today's `EntryKind`-keyed registries. But `entry.kind` is gone, so nothing hands core a `'buffer'`
string for a specific Entry any more, and `api/gantt.test.ts`'s `[review P2]` test still requires two
kind-defining plugins (`bufferKind()`, `riskKind()`) to install side by side with **zero collision** —
so a plugin's custom look must still reach real dispatch, not just sit in an inert table.

**The call:** a custom-look producer decides ownership itself and answers by *not* claiming the
Entry — it returns `[]` for an Entry it doesn't own, the same "no items" value `produceItemsForRow`
already uses for other cases. `produceItemsForRow` tries every *non-structural* registered look
(`ItemProducerRegistry`'s existing `keys()`, minus `'parent'`/`'leaf'`) before falling back to the
structural producer for `hasChildren ? 'parent' : 'leaf'`; the first non-empty result wins, and each
`Item`/`FrameBar` carries the `look` string whichever producer built it stamped on — `entryItem`/
`wholeEntryItem` now take `look` as an explicit parameter instead of reading `entry.kind`. The bar
renderer needs no new logic: it already resolves per-`item.look`, so `'buffer'`/`'risk'` reach
`bar:buffer`/`bar:risk` exactly as before, structurally unchanged.

Capability defaults have no producer function to test ownership against (`KindDefaults` is inert
data), so they cannot use the same trial. `resolveCapabilities`'s `CapabilityInputs` gained a single
`lookOf: (entry: Entry) => EntryLook` function — `layout/items/produce-items.ts` exports the same
trial (`resolveLook`) `GanttShell` already needs for item production, and both seams call the one
function so an Entry's look reads the same everywhere.

**What a plugin author does differently now:** "stores which ids it owns" (ADR 0013's own words) is
literal — `harness/plugins/buffer-kind.ts`/`risk-kind.ts` no longer read `entry.kind === 'buffer'`
(gone). They take the owned ids as a constructor argument (`bufferKind(ownedIds)`), keep a `Set` in
closure, and their producer/`command.when` both check membership directly. `api/gantt.test.ts`'s three
`[S5-A3]`/`[review P2]` tests are rewritten to pass ids in at plugin construction instead of authoring
`{ kind: 'buffer' }` on the test fixture.

**Why this is a J and not a Q:** the shape in `plans/01` is already locked (two ADRs' worth of prose
sweep), and the "two plugins, zero collision" behaviour is an existing, passing test this build must
not regress — so *some* dispatch-by-trial was unavoidable once `entry.kind` left. What is a genuine
judgment call, and worth a reviewer's second look, is putting the trial inside `layout/` as a shared
`resolveLook` rather than inventing a fifth public seam (a "look resolver" registration) that no
locked spec names.

### J17 — Session stopped at ~475k context, mid-build; handoff for a fresh agent

**Raised:** 2026-09-11, Build 3 (ADR 0013). **Status:** open — this is the receiving note for
whoever continues this build. Everything below is also in the commit message of `6c0e347` ("WIP,
does not compile") on `field-redesign-build`.

**Verification status: `verify:full` has NOT been run this session.** A `tsc --noEmit` run midway
through (before the handoff commit) showed ~270 errors, almost all in `*.test.ts` and `fixtures/*.ts`
files that still author `kind: 'x'` on entries or import `EntryKind`/`RollUpKinds`/`DatasetHierarchy`
(now deleted). Only one error was in real `src/` code (a `Pick<FrameBar, 'kind'>` type literal the
`FrameBar.kind`→`.look` rename correctly left alone, since it's a string literal, not a property
access) — fixed in the handoff commit. **Do not assume anything past that `tsc` run compiles**; the
harness (`main.ts`, `planner.ts`, `plugins.ts`) still calls `bufferKind()`/`riskKind()` with no
arguments, and both now require an `ownedIds` argument (see below).

**Done (implemented, not yet test-verified beyond a `tsc` skim):**
- `Entry`/`EntryInput` drop `kind`; `EntryKind` deleted from `model/entry.ts`. Core `kind` Field
  deleted from `data/fields/core-fields.ts`.
- `RollUpKinds`/`DatasetHierarchy`/`isRollUpKind` deleted end to end: `model/dataset.ts`,
  `data/dataset-state.ts`, `api/dataset.ts`, `model/index.ts`, `api/index.ts`.
- `data/hierarchy.ts` deleted outright (autoGroup/promoteNewParents — there is no `kind` to promote
  to any more). `data/build-commit-change-set.ts` and `data/transaction.ts` drop the whole
  hierarchy-promotion pipeline stage; the doc comment now says "four-stage commit pipeline".
- `data/rollup.ts`: `parentsToRecompute` asks `byParent` (structure) instead of a `kinds` Set.
  **The important behavioural change**: when an Aggregator returns `undefined` for a Field that
  *does* have children (a "declining" Aggregator, #270), the loop now writes `undefined` onto the
  parent (a real changeset row, `from` → `undefined`) instead of `continue`-ing and leaving the
  stale value — this single change is decision 6 (promotion drops authored values), the "dateless
  children clear the parent's dates" consequence, *and* #270, all at once. Read that loop
  (`rollUpFields`, the `if (value === undefined)` branch) before touching it again.
- `widenSegmentsToEnvelope` (J3/J9, the item your build file was specifically extended for): now
  takes `mintSegmentId: () => SegmentId` and mints a fresh Segment over the derived envelope when
  `parent.segments.length === 0` but the parent now spans — instead of only widening an existing
  set. **This is NOT yet proven against the actual gate assertion** ("a parent whose dates come only
  from its children holds a Segment, and a click on its bar selects it" — and the
  `.fg-bar-summary` exclusion in `e2e/data.spec.ts` needs deleting per your build file). No e2e run
  happened this session.
- `data/write-rule.ts`: `libraryWriteRule(hasChildren: boolean, field: Field)` — no more
  `isRollUpKind` callback parameter, since the caller now has a plain boolean already.
- `model/errors.ts`: new `DerivedFieldNotWritableError`. Exported from `model/index.ts` and
  `api/index.ts`. `model/error-report.ts`: new `'derived-values-dropped'` `BuiltInErrorCode` for
  decision 5's aggregate warning (NOT `'derived-field-not-writable'` — that thrown error's own code
  is not in `BuiltInErrorCode`, matching how `UnknownFieldError`'s `'unknown-field'` isn't either).
- `data/entry-store.ts`: `update()` now throws `DerivedFieldNotWritableError` when any field in the
  patch is `rollsUp` on an Entry that `childrenOf(key).length > 0` — checked over *every* key in the
  patch before any write happens, so `{ start, cost }` with a derived `cost` throws before `start`
  ever reaches `stageUpdate`. **This is the one door I'm confident is right**; the gate's own named
  assertion for it has no test yet.
- `data/error-reporting.ts`: new `buildDerivedValuesDroppedReport(dropped)` — one aggregate warning,
  wired into `transaction.ts#applyConstructionRollUp` only. **I made a scope call (logged nowhere
  else but here — treat this as its own J):** decision 5's warning fires for `new Dataset({ entries
  })` construction, where the ADR's own "500 parents, 1500 warnings" example lives. I did *not* wire
  it into the ordinary commit path (`build-commit-change-set.ts`) for `add()`/`update()`-triggered
  promotion, reading decision 6 ("the library never refuses this... ordinary ChangeSet row") as
  implying that path stays silent. **This directly contradicts the build file's own gate wording**
  ("`add()` and `new Dataset({ entries })` drop a derived value, and raise one report per
  operation") — a future pass should re-read decision 5's exact text and decide whether `add()`
  needs its own aggregate warning too, or whether my reading holds. I did not have time to resolve
  this before the context limit.
- **The four registries / "look" redesign (layout/view), the largest single piece of new design this
  build did:** `layout/items/produce-items.ts` is rewritten with a new public `EntryLook` type
  (`'parent' | 'leaf' | (string & {})`), `Item.look` (was `Item.kind`), and two new functions,
  `resolveItems`/`resolveLook`, that try every *non-structural* registered look first (a custom
  producer answers by returning `[]` when it doesn't own the Entry) and fall back to structure.
  `view/capability.ts` gained `CapabilityInputs.hasChildren` and `.lookOf` (replacing
  `isRollUpKind`), and `GanttShell` wires `lookOf` to the same `resolveLook` against
  `this.#registrations.itemProducers`, so a plugin's `registerLookDefaults('buffer', …)` and
  `registerItemProducer('buffer', …)` key off the *same* answer. **This is a genuine design
  invention, not something written verbatim anywhere in the ADR or plans** — see J16 above for the
  full reasoning and why it was unavoidable (the `[review P2]` "two kind-defining plugins, zero
  collision" test in `api/gantt.test.ts` requires real per-look dispatch, not just a
  parent/leaf binary). **A reviewer should treat J16 and this paragraph as the one thing in this
  build most worth a second pair of eyes** before it ships, because it settles part of D-S5-22's
  rewrite with no author sign-off yet.
- `harness/plugins/buffer-kind.ts` and `risk-kind.ts` rewritten to match: each now takes
  `ownedIds: Iterable<string>` at construction and keeps its own `Set<EntryId>`, checked directly by
  its item producer and its command's `when` — no more `entry.kind === 'buffer'` (impossible now).
  **`harness/main.ts`, `harness/planner.ts`, `harness/plugins.ts` still call `bufferKind()`/
  `riskKind()` with no arguments — this will not compile. Fixing the call sites (passing the actual
  ids the demo wants classified as buffer/risk) is the very next step.**
- Diamond deletion (`--fg-diamond-size`, `.fg-bar-diamond`, `KIND_SPAN_FLOOR_MULTIPLIER`,
  `DEFAULT_DIAMOND_SIZE_PX`, the milestone item producer) is done across `layout/frame.ts`,
  `view/frame-settings.ts`, `view/styles.ts`, `render/dom/index.ts`.
- Two renames done with `serena rename_symbol`, both diffed afterward per J10's mandate:
  - `FrameBar.kind` → `.look` (2 reported changes, but the diff showed it correctly propagated
    through `render/dom/index.ts` too — cross-file references worked here). **One manual fixup was
    still needed**: `frame.ts`'s own `look: item.kind` line was left wrong by the rename, because
    `item` is type `Item` (a *different* interface, hand-edited separately in the same session, not
    renamed) — `Item.kind`/`Item.look` and `FrameBar.kind`/`FrameBar.look` are two distinct symbols
    that happen to share a name; the rename tool correctly touched only one of them, and I had to
    catch the resulting mismatch by reading the diff, not by trusting "success".
  - `RendererByKind` → `RendererByLook`: **this one under-propagated** — `rename_symbol` reported
    "2 changes applied" and only touched the declaration in `layout/renderer.ts` plus (oddly) left a
    self-referential `RendererByLook as RendererByKind` alias in `layout/index.ts`'s re-export
    statement; seven other files (`api/gantt.ts`, `api/index.ts`, `view/gantt-shell.ts`,
    `view/frame-settings.ts`, `view/renderer-registry.ts`, and two harness files) still had the old
    name after the "successful" rename. Caught by grepping for the old name after the fact, not by
    the tool's own report. **Finished by hand** with `mcp__serena__replace_in_files` in regex mode,
    dry-run first (`\bRendererByKind\b` → `RendererByLook`, scoped to `{src,harness}/**/*.ts`), then
    applied with `expected_count` as a guard. **Lesson for the next build's own renames**: a type
    re-exported through a barrel file (`layout/index.ts`) is exactly where `rename_symbol` seems to
    under-propagate — after any such rename, `grep -rn '\bOldName\b'` across `src/` and `harness/`
    before trusting it, the same discipline J10 already asks for, but specifically call out
    re-exported/barrel names as a second failure mode beyond the reformat-race one J10 named.

**Not started at all:**
- Parent bar drag translating descendants (`beforeEntryMove`/`entryMove`, one veto refuses the whole
  gesture, parent's own `start`/`end` never written). Nothing touched in `interaction/`,
  `view/gesture-pipeline.ts`, or `view/core-commands.ts` for this.
- Any test file fix, except `src/data/hierarchy.test.ts` (rewritten wholesale) and
  `src/view/plugin-ports.test.ts`/`plugin-registrations.test.ts` (two call-site renames each, done
  only to satisfy the pre-commit lint hook, not a real pass over those files' content).
- Any fixture fix (`fixtures/demo-dataset.ts`, `fixtures/hierarchy-dataset.ts`,
  `fixtures/planner-dataset.ts`, `fixtures/empty-group-dataset.ts` all `tsc`-fail, per the list
  above).
- e2e work: the `.fg-bar-summary` exclusion in `e2e/data.spec.ts`, `e2e/selection.spec.ts:17`/`:101`
  — none of this was opened this session.
- Close-out: no `verify:full` run, no `harness/main.ts` API-gap review, no ADR 0013 status flip, no
  spike-gate grep, no `plans/**` prose sweep beyond what was already ahead-of-`src` in `plans/01`.

**Next agent's first move should be:** fix the three harness call sites for `bufferKind()`/
`riskKind()`, then run `pnpm exec tsc --noEmit` again and work the error list top to bottom — it is
almost entirely mechanical (`kind: 'x'` in a test fixture → drop it or move it to `props`;
`EntryKind`/`RollUpKinds`/`DatasetHierarchy` imports → delete). Do not re-derive the design questions
above; they are settled (J16/J17) unless a reviewer reverses them.

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

### J10 — `rename_symbol` on `Entry.meta`/`EntryInput.meta` silently corrupted five unrelated tokens elsewhere in the tree

**Raised:** 2026-09-11, Build 2 (ADR 0011). **Status:** found and fixed within this build; flagged for
every later build's own rename step.

The very first two operations of this build were `mcp__serena__rename_symbol` calls renaming
`Entry.meta` → `props` and `EntryInput.meta` → `props`, each reported as a clean, project-wide LSP
rename. A `pnpm verify:full` run much later in the build turned up four unrelated word corruptions
the rename introduced with no error and no diagnostic:

- `harness/planner.ts`: a doc comment's `its phase's hue` became `its pprops's hue`.
- `src/data/entry-reader.test.ts`: a test title's `keeps an authored segment id` became
  `keeps an aupropsed segment id`.
- `src/data/fields/field-access.test.ts`: a test title's `writeOntoEntry writes cost onto parent`
  became `wripropstoEntry writes cost onto parent`.
- `src/view/gantt-shell.test.ts`: a real functional break — the call `dataset: fakeDataset([alpha])`
  became `dataset: fakepropsset([alpha])` (a nonexistent identifier), and a nearby `name: 'a'` became
  `props: 'a'`.

In every case a run of 4 letters at some other location in the file was replaced by the 5-letter word
`props`, with no relation to the word "meta" at that spot. The working theory: this project's
PostToolUse hook reformats a file after every edit, and `rename_symbol`, having captured reference
*offsets* before that reformat ran (from an earlier tool call in the same batch, or a stale index),
applied its text edit at a byte offset that had since shifted — overwriting whatever token happened
to sit there instead of the real `meta` reference.

**The call:** found all four by diffing the whole working tree against `HEAD` and scanning every
changed line for an isolated `props`-containing token that didn't correspond to a real rename target
(`TMeta→TProps`, `StoredEdit→ProposedEdit`, `PlannerMeta→PlannerEntryProps`, `DemoMeta→DemoEntryProps`,
`meta→props` property accesses), then hand-verifying each one against `git show HEAD:<file>`. All four
are fixed in this build (see the commits touching `harness/planner.ts`, `src/data/entry-reader.test.ts`,
`src/data/fields/field-access.test.ts`, `src/view/gantt-shell.test.ts`).

**What a later build should do differently:** after any `rename_symbol` call that reports success,
diff the whole working tree against `HEAD` (or the branch tip before the rename) and scan for isolated
occurrences of the new name that don't correspond to a real, intended reference — not just spot-check
the files the tool says it touched. A rename that "succeeds" can still corrupt an unrelated file.

### J11 — `EntryStore.add()` / `DatasetOptions.entries` keep plain `EntryInput<TProps>`, not the `& Partial<TProps>` intersection Q15's wording suggests

**Raised:** 2026-09-11, Build 2 (ADR 0011). **Status:** standing; a **Q** for the author folded in here
because the two are the same decision.

Q15 (closed 2026-09-10, grill) says a constructor `entries` record and `add()`'s input take declared
Field keys flat, at the top, the same shape `update()` takes. The first attempt at this typed both
`EntryStore.add()`'s parameter and `DatasetOptions.entries`'s element type as
`EntryInput<TProps> & Partial<TProps>`. That compiles fine in isolation, but it is **uninhabitable by
any named `EntryInput<TProps>[]` value** once `TProps` defaults to an open record: TypeScript refuses
to assign a declared interface type (lacking an index signature) to a target that structurally
requires one, regardless of whether every individual property would satisfy it. In practice this
meant every fixture in the repository that pre-types its own entries array (e.g.
`export const plannerEntryInputs: readonly EntryInput<PlannerEntryProps>[] = [...]`) failed to satisfy
the widened parameter type the moment it was passed to `entries:` or `.add()` — dozens of type errors
across `fixtures/`, `harness/`, and the test suite, none of them a real bug in the fixture.

**The call:** reverted both signatures to plain `EntryInput<TProps>`. The **runtime** behaviour Q15
asks for still works exactly as specified — `propsFromInput` (`src/data/entry-reader.ts`) reads a flat
declared key off any object at ingest, regardless of what TypeScript's static type says the caller was
allowed to pass, because JavaScript objects carry extra own-enumerable keys that a narrower static type
never sees. What is lost is only the static type-check and editor autocomplete for a flat declared key
written directly at `add()`/construction — the same call still type-checks fine at `update()`, since
`EntryEdit`'s flat mapped-type construction doesn't have this problem (it never intersects a *named*
interface with an open record; every part of `EntryEdit` is itself a mapped type).

**Filed as [#281](https://github.com/Pawel-IT/FreeGantt/issues/281)** on 2026-09-11, at the author's
instruction, labelled `question` + `smell`. The question below now lives there and is tracked outside
this build-out.

**The question for the author:** is the runtime-only fulfillment of Q15 acceptable, or does the author
want a different type-level mechanism explored (e.g. a dedicated exported type for a constructor
record, built without going through `EntryInput` directly, so it can carry an index signature of its
own without breaking `EntryEnvelope`'s derivation from `EntryInput`)? Left as a real gap for a future
pass, documented here rather than hidden behind a `Partial` that only worked in the ADR's own example.

### J12 — `Field.compute` is genuinely absent from the stored arm, not `compute?: never`

**Raised:** 2026-09-11, Build 2 (ADR 0011). **Status:** standing, load-bearing — read before touching
the `Field` union again.

types.md's own abbreviated `Field` union sample writes `compute?: never` on the stored arm. Doing that
literally breaks the one thing that discriminant exists for: TypeScript's `'compute' in field`
narrowing only excludes a union member that **never declares the key at all** — a member that declares
the key as optional-and-`never` still counts as "having" it, so `'compute' in field` stops narrowing
the union at all once both arms declare the key. `hasSomewhereToWrite` (`view/capability.ts`) and the
registry's own `'compute' in merged` check both depend on this narrowing working, so `compute` is
omitted outright from the stored arm's members instead. The **other** cross-arm keys
(`rollUp`/`editable`/`equals`/`compare`/`parseValue`/`inputType`) are still explicitly declared `never`
on the arm that doesn't otherwise have them, purely for property-access ergonomics (`field.rollUp`
without narrowing first) — that trick is safe for all of *those* because nothing uses them as an `in`
discriminant.

### J13 — `writeField`'s stored-arm-only `FieldType` is written directly, not derived from `Field` via `Omit`

**Raised:** 2026-09-11, Build 2 (ADR 0011). **Status:** standing, load-bearing.

`FieldType` used to be `Omit<Field<TValue>, 'key' | 'source' | 'type'>`. `Field` is now a union, and
`Omit` does not distribute over a union — it collapses to the constituents' *common* keys, which would
have silently dropped `equals`/`parseValue`/`inputType` from every Field-type bundle (`percent`
(`field-types.ts`) needs `parseValue` and `inputType`). `FieldType` is now a plain interface, written
out by hand with every member the two arms carry between them. See `refuted.md`-style note: **do not
"simplify" this back to `Omit<Field, ...>`** — it was tried, and it silently breaks `percent`.

### J14 — `libraryWriteRule` moved into a new file, `src/data/write-rule.ts`, not into `field-registry.ts`

**Raised:** 2026-09-11, Build 2 (ADR 0011). **Status:** informational.

The ADR's own text cites `field-registry.ts:97` as already holding `rollsUp`, which reads as a hint to
land the moved resolver there too. Landed it in its own file instead (`src/data/write-rule.ts`),
because the doc comment on the file names its real job precisely: three questions, three owners, three
builds (this one, ADR 0013, ADR 0015) each filling exactly one arm. A single new file the "Who owns the
write resolver" table in `build/README.md` can point at directly seemed clearer than folding a
three-owner seam into a file whose existing job (`FieldRegistry`, `rollsUp`, `mergeField`) is unrelated
to write-refusal policy. `view/capability.ts` re-exports the two public type names (`WriteVerdict`,
`WriteRefusalReason`) unchanged, so nothing on the app-author surface moved.

### J15 — Two real production bugs found only by the full test suite, not by `tsc`/`eslint`

**Raised:** 2026-09-11, Build 2 (ADR 0011). **Status:** fixed in this build; read before touching
`build-commit-change-set.ts` again.

Both bugs are instances of the exact "two-shallow-spread" trap the ADR names for `mergeProposedEdits`
and `entryAfterEdit` — but in two spots the build file's own "Do not" list didn't name, because they
didn't exist as spreads-over-a-nested-bag until `ProposedEdit` gained required `__brand`/`props`/
`proposedKeys` keys:

1. **`fieldsWrittenBy`** (`build-commit-change-set.ts`) used to fall back to a raw `Object.keys(edit)`
   walk for edits that didn't state `proposedKeys`. Every `ProposedEdit` states `proposedKeys` now
   (it's required), so that fallback became live on *every* edit and started reporting `__brand` as a
   proposed Field name — tripping the I4 dev-mode guard on every commit that went through a body edit
   and an extender cascade together. Fixed by deleting the fallback: the function is now just
   `proposedKeysOf(edit)`.
2. **`mergeBodyAndExtenderEdits`** (same file) did `combined = { ...combined, ...reconciledEnvelope }`
   after reconciling a shared envelope write. `reconciledEnvelope.props` is always `{}` (that
   reconciliation only ever touches `start`/`end`/`segments`) and its `proposedKeys` only ever named
   the reconciled envelope keys — so the blind spread silently wiped `combined`'s real `props` back to
   `{}` and its `proposedKeys` down to just the envelope triad, dropping every other Field the body or
   the extender had proposed. The visible symptom was a transaction that neither threw nor fired a
   `change` event — `foldChangeSet` saw zero rows and returned `undefined`. Fixed by keeping
   `combined`'s own `props` and unioning both sides' `proposedKeys` explicitly instead of spreading.

Neither bug showed up in `tsc`/`eslint` — both are runtime data loss, not type errors. Only running the
full `vitest` suite surfaced them. A later build that touches this file's merge logic should re-read
both fixes before changing either.

### N5 — `test/guards/retired-words.test.ts`'s "host" guard and `src/extensions/keymap.ts`'s OS Meta key make the ADR's own `\bmeta\b` grep gate unable to reach a literal zero

**Raised:** 2026-09-11, Build 2 (ADR 0011). **Status:** resolved for "host"; documented, not resolved,
for the `meta` grep gate.

The build's own scoped grep gate (`grep -rn --include='*.ts' '\bmeta\b|FieldSource|source: \{' src/
harness/`) returns 6, not 0, after every real `meta`→`props` rename in this build is done. All 6 are
`src/extensions/keymap.ts` and its test: the keyboard **Meta key** (Cmd/Windows), an entirely different,
correct, standard concept (`KeyboardEvent.metaKey`) that has nothing to do with `Entry.meta`/
`FieldSource`. Renaming it would be wrong — it is not part of the vocabulary this ADR retires. The
gate's own comment already carves out 22 HTML false positives (`<meta charset>`, `class="meta"`); it
did not anticipate this `.ts` one. Recorded here rather than silently declared "close enough" — a
future gate author may want to narrow the pattern (e.g. `\bmeta\b(?!Key| key='|\.has\(')`) or add
`src/extensions/keymap.ts` to an explicit exclusion, the same way the HTML case is carved out in prose.
Separately, fixing this build's own leftover `host`→`hosts` comment in `harness/plugins.ts` (caught by
the *other* guard, `test/guards/retired-words.test.ts`) was a normal wording fix, already done.

### N6 — `harness/docs/{files,classes,diagram}.html` still name `FieldSource` beyond the one named row

**Raised:** 2026-09-11, Build 2 (ADR 0011). **Status:** left alone, out of this build's named scope.

This build's work list names exactly one row to fix — the `FieldSource` row at
`harness/docs/files.html:130-132` — and calls it harness documentation, not a gate; that row is fixed.
`files.html` still has two more stale rows (`data/fields/field-access.ts`'s description calling it
"the one switch over `FieldSource`", and a `data/fields/source-strategy.ts` row describing a file this
build deleted outright), and `harness/docs/classes.html` and `harness/docs/diagram.html` both still
list `FieldSource` in `model/`'s exports and in the module-boundary diagram. None of these were named
in this build's work list, so none are touched here — flagged for whichever build or review pass
does the "ahead-of-`src/` banners" sweep `build/README.md` schedules for the last build.
