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

### J18 — `milestoneKind()`, a new harness plugin, replaces every fixture's `kind: 'milestone'`

**Raised:** 2026-09-11, Build 3 (ADR 0013), continuing from J17's handoff. **Status:** informational —
a mechanical application of J16's own pattern, not a new design decision.

Three call sites authored `kind: 'milestone'` on one or more ids purely to reach a diamond bar:
`fixtures/demo-dataset.ts` (`entry-4`, read by `harness/main.ts`), `harness/plugins.ts` (`entry-39`),
and `fixtures/planner-dataset.ts` (every row whose flag string contains `m`, read by
`harness/planner.ts`). Core ships no milestone producer any more (the work item this build file
already ticked), so none of the three could just delete the property — each page still wants the
look. Added `harness/plugins/milestone-kind.ts`, a fourth peer of `bufferKind()`/`riskKind()`: same
`ownedIds`-at-construction shape, but it registers only the item-producer seam (D-S5-22's "what shape
does it draw?") since none of the three pages ever gave a milestone its own move/resize rule or
command — the other three seams stay at the library default, unlike `bufferKind()`/`riskKind()`.
`fixtures/demo-dataset.ts` now exports `MILESTONE_ENTRY_ID`; `fixtures/planner-dataset.ts` now exports
`plannerCheckpointEntryIds` (filled by `entryForRow` as it builds each row, since a checkpoint used to
be `flags.includes('m')` at that same call site). Both fixtures' own "which rows are work rows, not a
phase or a checkpoint" logic (`planner-dataset.ts`'s `WORK_ROW_NUMBERS`, the `ref` compute Field) moved
from `entry.kind === undefined` to `parentId !== undefined && !checkpointIds.has(id)` — a phase has no
`parentId` in this fixture, so the two structural facts (has a parent, is not a named checkpoint) say
the same thing the old classification did. `harness/planner.ts`'s `PHASE_BARS` renamed its `group` key
to `parent`: a phase is any row with children, which now reaches the structural `'parent'` look with no
plugin at all (J16) — no plugin was written for the phase rail, only for the checkpoint diamond.

Also removed in the same pass: `harness/hierarchy.ts`'s `autoGroup` checkbox and the
`dataset.hierarchy = { autoGroup }` write it drove. `rollUpKinds`/`hierarchy.autoGroup` are deleted
outright by this build (a ticked work item), so there is no config left for that checkbox to toggle —
the behaviour it used to switch off is now unconditional. `harness/hierarchy.html` drops the checkbox
markup; nothing replaces it, because nothing needs replacing.

### J19 — Handoff: mid-build stop at ~250k context, continuing Build 3 (ADR 0013) compile/test repair

**Raised:** 2026-09-11, Build 3 (ADR 0013), continuing from J17/J18. **Status:** open — this is the
receiving note for whoever continues the compile/test cleanup.

**tsc error count.** Command: `pnpm exec tsc --noEmit 2>&1 | grep -c "error TS"`. At session start
(inherited from J17's handoff): **255**. Right now: **136**. Breakdown right now
(`pnpm exec tsc --noEmit 2>&1 | grep "error TS" | sed 's/(.*//' | sort | uniq -c | sort -rn`):

```
36 src/view/capability.test.ts        -> now 0 (fixed, see below)
33 src/api/gantt.test.ts              -> now 0 (fixed, see below)
30 src/layout/items/produce-items.test.ts -> now 0 (fixed, see below)
25 src/api/dataset.test.ts            -> NOT STARTED, still ~25
15 src/layout/frame.test.ts           -> NOT STARTED
13 src/view/gantt-shell.test.ts       -> NOT STARTED
11 src/data/entry-store.mutation.test.ts -> NOT STARTED
 7 src/data/transaction.test.ts       -> NOT STARTED
 5 src/layout/frame-layout.test.ts    -> NOT STARTED
 5 src/data/rollup.test.ts            -> NOT STARTED
 5 src/data/rollup.property.test.ts   -> NOT STARTED
 4 src/view/frame-settings.test.ts    -> NOT STARTED
 ... (roughly 30 more files, 1-3 errors each) -> NOT STARTED
```

Re-run the breakdown command yourself for the exact live count — this list is a snapshot, not a
promise. `harness/**`, `fixtures/**`, `src/data/hierarchy.test.ts`, `src/view/capability.test.ts`,
`src/api/gantt.test.ts`, and `src/layout/items/produce-items.test.ts` are the only things touched
this session and are all confirmed at **0 tsc errors** as of the last commit.

**Files fully converted, in commit order** (`git log --oneline` on `field-redesign-build` from
`1f0ce60` to `215107e`):
1. `harness/**`, `fixtures/**` (`1f0ce60`) — the three harness call sites from J17's own "next
   agent's first move", plus a new `harness/plugins/milestone-kind.ts` (J18) and the removal of
   `harness/hierarchy.ts`'s retired `autoGroup` checkbox.
2. `src/view/capability.test.ts`, `src/data/hierarchy.test.ts` (`5fb92f4`).
3. `src/layout/items/produce-items.test.ts` (`4415522`).
4. `src/api/gantt.test.ts` (`215107e`).

**Mid-file when stopped:** none — every file above is fully clean, and I stopped at a commit
boundary rather than partway through one, per the coordinator's instruction. The **next** file to
open is `src/api/dataset.test.ts` (25 errors), then work the `tsc` list top to bottom exactly as
J17 asked the previous agent to.

**Tests deleted or weakened, and why — one line each:**
1. `src/view/capability.test.ts`: deleted "defaults a milestone to move/select true, resize false —
   it has no edge to drag." Core no longer special-cases any look for gesture defaults —
   `resolveCapabilities`'s `gestureIsOffered()` always returns `true` now (read its own doc comment:
   "there is no stored classification left to special-case a gesture off of"); that policy is a
   plugin's own `registerLookDefaults` call. No replacement assertion in this file, because
   `capability.test.ts` has no plugin registry to install one against — the equivalent coverage
   lives in `gantt.test.ts`'s `registerLookDefaults` describe block, which already exercises exactly
   this (`resize: false` on a registered look), so the guarantee is not lost, only relocated.
2. `src/api/gantt.test.ts`: no test assertions were deleted from this file. Three tests that had
   asserted the same now-retired core default (a plain milestone or a `kind: 'group'` entry
   refusing resize/move with **no plugin installed**) were rewritten to install the smallest version
   of the plugin that now owns that default (`ctx.layout.registerItemProducer` +
   `ctx.interaction.registerLookDefaults`, following `harness/plugins/milestone-kind.ts`'s own
   shape) — see the commit message on `215107e` for the full list. This is a rewrite, not a
   deletion: the coverage for "a look can refuse resize by default" still exists, just through the
   mechanism that now provides it.
3. `src/layout/items/produce-items.test.ts`: two tests renamed from "falls back to the span producer
   for an unregistered Kind" to "falls back to the leaf/parent producer for a childless/parent-having
   Entry no registered look claims" — same guarantee (an unclaimed Entry still draws something),
   restated against structure instead of a `'span'` kind that no longer exists as a registry key.

**Update, after the stop request:** I did run `pnpm exec vitest run src/api/gantt.test.ts` before
writing this handoff (the coordinator's own suggested next step), and it is **not** green: 192/196
pass, 4 fail. All four are in code this session touched, in the last commit (`215107e`) — **not
committed as green, and not yet fixed**. Read this before opening `src/api/dataset.test.ts`.

1. `[review P2] two plugins that each define a look both install, both paint, and dropping one
   leaves the other`: `TypeError: Cannot read properties of undefined (reading 'classList')` — after
   `gantt.plugins = [risk]` drops `bufferKind()`, `barFor('buffer')` finds nothing. **Root cause,
   understood, not yet fixed:** under the old `entry.kind` scheme, `data-kind="buffer"` was a fact
   about the Entry, so it survived the plugin's removal even though the paint class went away. Under
   ADR 0013, `'buffer'` is a look the item producer claims — dropping the plugin drops the producer,
   so the Entry's look reverts to structural `'leaf'` and `data-kind` reverts with it. The test's own
   `barFor(kind)` helper, which finds a bar *by* `data-kind`, cannot locate a bar whose `data-kind`
   just changed out from under it. Needs a helper that tracks the bar by something stable across a
   look change (`data-item-id`, or the bar's position/entry, established once before the drop) rather
   than by `data-kind`.
2. `[S5-A3] the 'buffer' kind lives in harness/plugins/buffer-kind.ts alone — no src/ non-test file
   names it`: fails because `src/view/capability.ts:100` — a doc comment, `` `registerLookDefaults('buffer',
   …)` `` — names the string `'buffer'` as a worked example. **This pre-dates this session**
   (`git log -L100,100:src/view/capability.ts` blames it on `6c0e347`, Build 3's own earlier WIP
   commit) — I did not write this comment and did not touch this file this session. Flagging per the
   dispatch's instruction to report rather than bend the test: the comment should probably use a
   different example look name (or a placeholder), or the gate's own regex needs a documented
   exception the way the HTML false-positive carve-out works elsewhere in this build (see N5) — an
   author call, not mine to make unilaterally.
3. `clearCapabilityRule restores a registered look default, which \`true\` would not (#195)`:
   `expected true to be false` at the first assertion, right after `setCapabilityRule('resize',
   true)`. **Not yet diagnosed.** Working hypothesis: `milestoneBar` (`container.querySelector('[data-kind="milestone"]')`)
   resolves to `null` in this multi-entry dataset (`m1` plus the full `sampleEntries` list), so
   `document.elementFromPoint`'s override always returns `null`, no bar ever receives hover state,
   and every handle stays `hidden` regardless of the capability rule — the same class of symptom as
   #1 above, but I have not confirmed it (no `console.log`/debugger step was run; I stopped at the
   context limit before instrumenting it). The near-identical single-entry version of this same
   plugin pattern (test 4 below) passes, which is what points at "something about the multi-entry
   render," not the plugin registration itself.
4. Confirmed passing, for contrast: `a resize-incapable look (a plugin default) never gets a resize
   handle to grab (D-S3-9)` — the same `registerItemProducer` + `registerLookDefaults` pattern, but
   with **only `m1`** in the dataset. This is the test that should guide the fix for #3.

**No real `src/` bug found this session** among the three failures above — #1 and #3 are this
session's own test-helper bugs (a `data-kind`-keyed lookup that ADR 0013 makes unstable across a
plugin drop), not `src/` defects. #2 is pre-existing (Build 3's earlier session, not mine) and is a
doc-comment/gate-regex disagreement, not a functional bug — flagged for the author rather than
silently reworded, per the dispatch's stop rule.

**Serena renames this session: none.** Every change was a hand edit (`Edit` tool), not a symbol
rename — nothing renamed a symbol across files this session, so there is no propagation risk to
verify. (The `RendererByLook`/`FrameBar.look` renames were Build 3's earlier session, already
verified per J17.)

**Next agent's first move:** fix the 3 failures logged just above in `src/api/gantt.test.ts`
(`215107e` is committed but not runtime-green — this is known and named, not hidden). Then continue
top-down from `src/api/dataset.test.ts` (25 errors) exactly as J17 originally asked — the
harness/fixture/test pattern is now well established across four files and should be mechanical
from here: `kind: 'x'` literal -> drop it or give the entry a real child; `entry.kind ===` read ->
structural `childrenOf`/id-based check; `registerKindDefaults` -> `registerLookDefaults`, paired
with a `registerItemProducer` claim when the test needs a specific Entry to resolve to a specific
look — but read failure #1 and #3 above first: a `data-kind`-keyed test helper is no longer a safe
way to track one bar across a plugin install/uninstall, and every remaining file may have the same
helper pattern lurking in it.

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

### N7 — a plugin passed in the `Gantt` constructor misses the first paint, so every plugin-defined look flashes structural for one frame

**Found by the coordinator**, verifying Build 3a's report. Build 3a left
`gantt.test.ts`'s *"a custom milestone barRenderer paints a diamond"* failing and did **not** list it
among the failures it named, so it was never diagnosed. It is not a test bug.

`src/api/gantt.ts` builds `GanttShell`, which paints its first frame **synchronously during
construction**, and only then assigns the constructor's options:

```ts
    });                                                               // ← shell built; frame 1 painted
    if (options.zoomPresets !== undefined) this.#shell.zoomPresets = options.zoomPresets;
    if (options.selectedSegmentIds !== undefined) this.#shell.selection = options.selectedSegmentIds;
    if (options.plugins !== undefined) this.#shell.plugins = options.plugins;   // ← line 307
```

Measured with a throwaway probe (since deleted), on a Gantt constructed with a plugin registering an
item producer for look `'milestone'`:

| | `data-kind` | custom class applied |
|---|---|---|
| Frame 1 (synchronous, post-constructor) | `leaf` | no |
| Frame 2 (after one `rAF`) | `milestone` | yes |

The bar is the **same DOM node** across both, so I8 (no remount) holds and the end state is correct.
The defect is frame 1.

**Why ADR 0013 exposed it and nothing caught it before.** The look used to come from stored data
(`entry.kind`), which the shell held at construction, so frame 1 was already right. ADR 0013 moved
the look to `resolveLook`, which asks the *item-producer registry* — and that registry is empty until
plugin `setup()` runs. So the regression is a direct consequence of this ADR, and it is invisible to
`tsc`: the code compiles and the final frame is correct.

**Why this is `src/`'s to fix, not the test's.** The consumer passed `plugins` in the *same options
object* as `barRenderer`. One constructor call, one expectation: one correct first paint. Rewriting
the test to `await` a frame would bend the test to fit the bug — the outcome the Build 3a dispatch
named as the worst one. `resolveLook` itself is correct; the ordering around it is not.

**Owed:** an issue, and a fix that installs constructor plugins before the shell's first paint (or
defers that paint until the constructor's options are all applied). `zoomPresets` and `selection` sit
on the same three lines and deserve the same question. See [[J16]] — this is the `EntryLook`/
`resolveLook` design, the part already flagged as most worth a reviewer's second look.

**FIXED**, 2026-09-11, Build 3b. `GanttShellOptions` gained three constructor-only options —
`plugins`, `zoomPresets`, `selectedSegmentIds` — applied through the shell's own existing live
setters (`this.plugins = …`, `this.zoomPresets = …`, `this.selection = …`) right before the
constructor's own `this.#phase = 'live'; this.#frames.flush();`. `resolveLook`/`Capabilities`
already read their registries live at render time rather than a cached snapshot taken once (J16),
so no other ordering in the constructor needed to move — plugin `setup()` runs after every
collaborator it can reach (`#registrations`, `#commandRegistry`, `#keymap`, `#segmentSelection`,
`#viewport`) is already built, same as a post-construction assignment would see. `api/gantt.ts` now
passes `plugins`/`selectedSegmentIds` into the `new GanttShell({...})` call instead of assigning
`this.#shell.plugins`/`.selection` after it returns (`zoomPresets` folded into the existing
`pickDefined` list, since its type is identical on both sides). The old three post-construction
lines are deleted; no behaviour depends on them running late any more.

**Why this stays a reordering, not a restructure:** `GanttShell`'s constructor already builds every
plugin-relevant collaborator before its own final flush — the fix only moves *when within that same
constructor* three already-existing live setters are called, from "after `api/gantt.ts`'s
constructor returns" to "a few statements before this constructor's own last line." No new
collaborator, no new field, no change to `resolveLook` itself (J16's design stands untouched).

**Verified:** `pnpm exec tsc --noEmit` stays at 136 errors (no new ones in `gantt.ts`/`gantt-shell.ts`).
`pnpm exec vitest run src/api/gantt.test.ts` — 196/196 pass, including the two tests J19 named as
N7 casualties ("a custom milestone barRenderer paints a diamond…", "clearCapabilityRule restores a
registered look default (#195)") with **no `await` added** to either.

### J20 — `[review P2]`'s `barFor` helper now keys on the Entry's own id, not `data-kind`

**Raised:** 2026-09-11, Build 3b, closing out J19's failure #1. **Status:** a test fix, not a `src/`
change — the dispatch's own diagnosis (J19) already named the right mechanism.

`barFor(kind)` found a bar by `data-kind`, which is exactly the attribute ADR 0013 makes unstable
across a plugin drop (a claimed Entry's look reverts to structural `'leaf'`, and `data-kind` reverts
with it). Rewrote it to `barFor(entryId)`, matching `data-item-id`'s `${entryId}:${segmentIndex}`
convention (`layout/items/produce-items.ts`) with a `startsWith` check — the bar node for a given
Entry is the same DOM node before and after a plugin drop (I8), so this is stable across every
assertion in the test. The test's own intent (each plugin's class shows up and goes away with its
own install/uninstall) is unchanged; only how the test locates the bar element changed. No assertion
was weakened or deleted.

### J21 — `src/api/dataset.test.ts`: retired `rollUpKinds`/`hierarchy.autoGroup`/`entry.kind` tests deleted, structural ones kept

**Raised:** 2026-09-11, Build 3b, continuing J19's tsc-cleanup pass. **Status:** mechanical, per J17's
own instruction ("`kind: 'x'` in a test fixture -> drop it or move it to `props`;
`EntryKind`/`RollUpKinds`/`DatasetHierarchy` imports -> delete").

- "carries optional fields through, and leaves absent ones absent": dropped `kind: 'milestone'` and
  its two assertions (`entry.kind`, the `'kind'` entry in the expected key list). The test's real
  claim — an authored extra key (`props`) survives ingest and an absent one never appears as
  `undefined` — is unchanged and still asserted.
- "entries.childrenOf returns direct children; rollUpKinds defaults to group" → renamed to
  "entries.childrenOf returns direct children", `rollUpKinds`/`hierarchy` assertions dropped, the
  `childrenOf` assertion (its real subject) kept unchanged.
- "rollUpKinds setter accepts 'none' and [] as empty-list sugar (D-S4-6)" and "live
  hierarchy.autoGroup changes later first-child promotions only": **deleted outright**, no
  replacement. Both exercised `data/hierarchy.ts`'s `autoGroup`/`promoteNewParents`, which J17
  deleted end to end ("there is no `kind` to promote to any more") — the feature these tests covered
  no longer exists in the design, so there is nothing to restate them against.
- Six other spots (`{ id: 'root', name: 'Sitework', kind: 'group' }` and near-identical siblings): a
  bare `kind: 'group'` marking a rollup parent for a `fieldTypes: { rollUp: 'sum' }` test. Rollup is
  now purely structural (any Entry with children rolls up), so the parent needs no marker at all —
  deleted the `kind` property only, left every other assertion (the actual rollup behaviour under
  test) untouched.

**Verified:** `pnpm exec tsc --noEmit` shows 0 errors in this file (was 25). `pnpm exec vitest run
src/api/dataset.test.ts` — 49/49 pass.

### J22 — `src/layout/frame.test.ts`: the whole "milestone floor" describe block deleted; every other `kind` spot rewritten structurally

**Raised:** 2026-09-11, Build 3b, continuing the tsc-cleanup pass. **Status:** mechanical, following
J17's own instruction, with one describe block that is a real deletion (a retired feature, not a
weakened assertion) and one rewrite worth a second look.

- `barSpan`'s own signature dropped its `diamondSizePx` parameter and `DEFAULT_DIAMOND_SIZE_PX`
  export entirely (J17: "Diamond deletion... is done across `layout/frame.ts`"), so the whole
  `describe('barSpan — milestone floor (bug hunt: milestone highlight box)')` block and its two
  diamond-specific cases inside `describe('barSpan — a minimum painted bar width ...')` (`'never
  shrinks a milestone floor...'`, `'widens minBarWidthPx past a milestone floor...'`) test a
  parameter and a constant that no longer exist. **Deleted outright** — there is nothing to restate
  them against, the same reasoning as the retired `rollUpKinds`/`autoGroup` tests in J21. Kept (and
  generalized off "milestone" to "a zero-width span", since the floor behaviour itself is
  look-independent now): "floors a zero-width span at minBarWidthPx and stamps minimumSpan",
  "honours a custom minBarWidthPx" (renamed from the diamond-specific "honours a custom
  diamondSizePx"), and the two midpoint-centring cases, all still exercising the one floor rule
  `barSpan` still has.
- The `barSpanFields()` test helper (added `kind` to `spanOf()`'s `{start, end}` because the old
  `barSpan(entry, scale, diamondSizePx?, minBarWidthPx?)` read `entry.kind` to pick the diamond vs.
  rect floor) is deleted; every call site now uses `spanOf()` directly, matching `barSpan`'s current
  `Pick<Item, 'start' | 'end'>` parameter.
- Two `groupBy: (entry) => entry.kind` (header-row tests unrelated to what the group key names)
  became `groupBy: () => 'all'` — the tests assert a header row exists with no entries of its own,
  not anything about the grouping key's content.
- The "fills each cell..." / "fills cells from LayoutInput.columns..." pair used a `field: 'kind'`
  column reading `entry.kind` purely as a second, distinct field alongside `name` — switched to
  `field: 'id'` reading `entry.id`, an equally distinct, always-present field. No claim about `kind`
  specifically was ever part of either test's own name or assertion.
- "carries the segmentId its Item had... (#212)": `grouped = { ...sampleEntries[1]!, kind: 'group' }`
  made a whole-entry (parent) bar the old way. A whole-entry bar is now structural (a real child), so
  `grouped` lost the `kind` marker and gained one (`groupedChild`, `parentId: grouped.id`) — the
  assertion under test (a parent's own bar carries no `segmentId`) is unchanged.
- `entryAt()` (the `horizontal culling` describe's own entry builder): dropped a bare `kind: 'span'`
  with no other change — every Entry it builds is childless, so it already resolved to `'leaf'`
  structurally.

**Verified:** `pnpm exec tsc --noEmit` shows 0 errors in this file (was 15).
`pnpm exec vitest run src/layout/frame.test.ts` — 46/46 pass after `-u`, which updated exactly the
pre-existing `FrameBar.kind` → `.look` snapshot rename (already verified as a pure rename in J17) —
`git diff` on the snapshot shows only `-"kind": "span"` / `+"look": "leaf"`, nothing else changed.

### J23 — `src/view/gantt-shell.test.ts`: pure deletions, no rewrite needed

**Raised:** 2026-09-11, Build 3b, continuing the tsc-cleanup pass. **Status:** mechanical.

`fakeDataset()`'s `context`/return object dropped `rollUpKinds: new Set(['group'])` and
`isRollUpKind: () => false` — neither is part of `model/dataset.ts`'s narrow `Dataset` interface
(or `EntryStore`'s own context type) any more; every other member was already correct. 14 bare
`kind: 'span',`/`kind: 'span' as const,` lines across the file (test fixtures, every one a leaf
Entry with no `kind`-dependent assertion) deleted with no other change — `tallEntries()`'s own
`kind: 'span' as const` at line 147/520 raised no `tsc` error (the object literal reaches `Entry[]`
through an untyped `Array.from` callback, so no excess-property check fires on it), but was removed
anyway for consistency since it is the same dead field the other twelve are. Left `kind: 'row'`/
`kind: 'move'` untouched — unrelated discriminants (`Selection.selectableSegmentsOf`'s hit-kind,
`session()`'s gesture-kind), not `Entry.kind`.

**Verified:** `pnpm exec tsc --noEmit` shows 0 errors in this file (was 13).
`pnpm exec vitest run src/view/gantt-shell.test.ts` — 35/35 pass, no snapshot involved.

### J24 — `src/data/entry-store.mutation.test.ts`: compiles clean; 3 of 52 tests fail for a real `src/` reason, left unfixed and reported below (Q6)

**Raised:** 2026-09-11, Build 3b, continuing the tsc-cleanup pass. **Status:** the compile fixes are
mechanical (test rewrites); the three runtime failures are **not** test bugs — see Q6 immediately
below, which is the important part of this entry.

Compile-only changes, mechanical, following the same pattern as J21–J23:
- `dataset()`'s helper dropped its `options: { rollUpKinds?: ... }` parameter — `DatasetState`'s
  constructor never had a `rollUpKinds` option to forward it to; the one call site that used to pass
  `{ rollUpKinds: [] }` is the deleted test below.
- 9 bare `kind: 'group'`/`kind: 'span'` markers deleted from entry literals across `roll-up (§1.5)`
  and `rollup (§1.5)` — every one was on an Entry whose parent/child status is already stated by
  `parentId`, so rollup dispatch (now structural) is unaffected.
- `describe('roll-up kinds (§1.5)')`'s two tests ("a childless roll-up kind...", "a non-deriving
  kind...") both asserted the same ADR 0012 claim ("no dates, no children, no error") under two
  `kind` markers that no longer distinguish anything — merged into one:
  "an Entry with no dates and no children is legal, and stays dateless (ADR 0012)". No coverage
  lost: both original assertions were already testing the one behaviour with two labels.
  `rollup (§1.5)`'s "a childless group stays dateless (ADR 0012)" duplicated this exact claim a
  second time under yet another label — **deleted**, since the merged test above already states it.
- `"with rollUpKinds: [], nothing rolls up at all"` — **deleted outright**, no replacement. It tested
  "opt a kind out of rollup," a `rollUpKinds`-keyed feature retired end to end by J17. Rollup is
  unconditional for any Entry with children now, so there is no "opt out" left to test.
- "moving a child moves its parent... reverting both fields restores both": its own "undo" step used
  to loop `state.entries.update('p1', { [row.field]: row.from })` for each rolled-up field — this is
  now refused by `entries.update()`'s own new guard (`DerivedFieldNotWritableError`, decision 6,
  J17) whenever the target has children, which `p1` still does at that point. Rewrote the undo step
  to `state.replay(invertChangeSet(seen[0]!))`, the same door `api/dataset.test.ts`'s "a consumer
  History..." test already uses for exactly this. The test's own claim (reverting the cascade
  restores both fields) is unchanged; only the mechanism used to revert changed.

**Verified:** `pnpm exec tsc --noEmit` shows 0 errors in this file (was 11).
`pnpm exec vitest run src/data/entry-store.mutation.test.ts` — **49/52 pass, 3 fail** — see Q6.

### Q6 — Two apparent `src/` conflicts surfaced by running (not just compiling) `entry-store.mutation.test.ts` — needs the author's read before anyone touches `entry-store.ts`/rollup internals

**Raised:** 2026-09-11, Build 3b. **Status:** open, with a coordinator's reading below that narrows
what the author has to decide.

> **Coordinator's note, 2026-09-11 — the guard is not decision 6, and ADR 0013 says where it belongs.**
> Build 3b calls the refusal "decision 6". It is not. ADR 0013 line 74 states decision 6 verbatim:
> *"An Entry that starts rolling up drops its authored values, and the Rollup recalculates them…
> **The library never refuses this.**"* Decision 6 is about **promotion dropping values**, and it
> explicitly never refuses a write.
>
> The refusal is a different mechanism — the **derived arm** of the write resolver, line 81: *"This
> ADR fills the derived arm and wires **`entries.update()`** to it."* Line 91 adds: *"Parent **cells**
> stay refused."* Both name a **consumer-facing door**. ADR 0013's own "six doors" list is six
> consumer entry points; internal bookkeeping is not among them.
>
> The guard as built sits in `EntryStore.update()`, which is **both** the consumer door and the
> library's own internal write path. That is why it catches `#removeSegmentsFrom()`'s structural
> `{ start: undefined, end: undefined }` and the same-transaction proposal that rollup §1.5 protects.
> So this reads as a **placement** bug, not a contradiction between decisions 5 and 6: the refusal
> belongs at the consumer door, above the library's internal writes, and both red tests then pass
> without either decision being reversed.
>
> **Still the author's call** — moving a guard changes what every one of the six doors refuses, and
> the third finding (quadratic scaling) is unrelated and still undiagnosed. But the author is
> choosing *where the guard sits*, not *which decision to overturn*.

Per CLAUDE.md's stop rule and the dispatch's own
instruction ("if a test is red because `src/` is genuinely wrong, stop and report it... do not
change the test"), **the three tests below are left red, unmodified from before this session's
`kind`-removal edits** (two of them — `removeSegments`/quadratic-scaling — were never touched by
this session's edits at all; the third — "a parent whose span..." — only had its dead `kind: 'group'`
marker removed, no other change). None was weakened, deleted, or rewritten to dodge the failure.

**1. `entries.update()`'s new write-refusal (decision 6) blocks its own library's internal callers,
not just a consumer's direct write.**

`EntryStore.update()` throws `DerivedFieldNotWritableError` whenever the patch touches a `rollsUp`
field and `childrenOf(key).length > 0` — no exception for who is calling. Two failures come from
this:

- `#removeSegmentsFrom()` (the internal step behind `entries.removeSegments()`) calls
  `this.update(id, { start: undefined, end: undefined })` when an Entry's last Segment goes (ADR
  0012: the Entry survives, dateless). If that Entry has children, this internal, structural
  bookkeeping call now throws the same error a misbehaving consumer would get — even though nothing
  here is a consumer trying to override a derived value with an arbitrary one; it is the library
  clearing a field an upcoming Rollup pass is about to recompute anyway. Test: `"a last-Segment
  removal never touches the Entry's descendants (ADR 0012...)"`.
- `"a parent whose span the same transaction proposed keeps the proposed value"` (a
  **pre-existing, previously-passing** test guarding decision 5 itself — "a group whose span the
  same transaction proposed keeps the proposed value") does exactly what decision 5 says a consumer
  is allowed to do: `state.transaction(() => { state.entries.update('p1', {start, end}); … })` while
  `p1` already has a child. Decision 6's blanket guard refuses this outright, because `p1` has
  children at the time of the call — even though this is the one case decision 5 explicitly
  protects (the same-transaction proposal is supposed to win over the cascade, not be refused
  before the cascade ever runs).

These two readings of decision 6 look mutually exclusive as implemented: either the guard is
supposed to block every direct write to a rolling-up field regardless of caller (which breaks
decision 5's own named case and `removeSegments`'s internal bookkeeping), or it is supposed to
block only a *consumer's* write that is not part of the same transaction's own proposal (which is a
narrower rule the current code does not implement). I did not choose between these and did not
touch `entry-store.ts` — this needs the author's (or J17's own author's) read on which decision 6
was actually meant to say, since reversing it either way is a judgement call bigger than a test fix.

**2. A quadratic-time regression in Segment-id uniqueness checking, unrelated to `kind`/rollup.**

`"S1: checking a transaction's Segment ids for uniqueness scales with entryCount, not entryCount²"`
counts `entryAfterEdit` calls for a 100-Entry and a 400-Entry multi-Segment delete and asserts the
4x-larger case costs at most a small multiple more (`large < small * 4 + 50`). It now reads
**81400** for 400 entries against a threshold of 21450 — consistent with the exact quadratic
behaviour the test's own comment says the original fix (`WriteSet.segmentOwner`, a #212 finding)
was written to kill. None of these Entries have a `parentId` (they are flat siblings), so this is
not the decision-6 guard from finding 1 — something else in this build's changes to
`data/entry-store.ts`/`data/rollup.ts`/`data/write-set.ts` reintroduced the O(n²) path. **Not
investigated further** — this needs someone to bisect which of this build's `data/` changes
touched the `WriteSet.segmentOwner` lookup or `entryAfterEdit`'s call frequency, which is beyond a
tsc-cleanup pass's scope.

**Why this stayed a Q, not a J:** both are `src/` behaviour, not test authoring, and reversing either
needs a decision only the author (or whoever re-reads decision 6's own intent) should make — not an
agent mid-cleanup guessing which of two plausible readings was meant.

### J25 — Build 3b handoff: mid-build stop, N7 confirmed fixed by reordering (no restructure needed), tsc 136 → 72

**Raised:** 2026-09-11, Build 3b, continuing J19's tsc-cleanup pass. **Status:** open — the receiving
note for whoever continues. Written at the coordinator's request at ~207k context, at a commit
boundary (`ae4a99a`, `entry-store.mutation.test.ts` just landed).

**tsc count.** Command: `pnpm exec tsc --noEmit 2>&1 | grep -c "error TS"`. Session start
(inherited from J19): **136**. Right now: **72**. All 72 remaining are in `*.test.ts` files; `src/`,
`harness/`, `fixtures/` stay at 0 (unchanged this session).

```
7 src/data/transaction.test.ts
 5 src/layout/frame-layout.test.ts
 5 src/data/rollup.test.ts
 5 src/data/rollup.property.test.ts
 4 src/view/frame-settings.test.ts
 3 src/view/gesture-pipeline.test.ts
 3 src/data/entry-reader.test.ts
 (~30 more files, 1-2 errors each)
```
Re-run the breakdown yourself (`pnpm exec tsc --noEmit 2>&1 | grep "error TS" | sed 's/(.*//' | sort
| uniq -c | sort -rn`) — this is a snapshot. `src/data/transaction.test.ts` jumped from 7 (J19's
snapshot) to 15 — not a regression from this session (nothing here touched that file); J19's own
count was itself already stale by the time it was written, per its own disclaimer.

**N7 (the dispatch's Task 1): fixed by reordering — no shell restructure was needed.** Full detail
already in the "N7" note above (marked **FIXED**) and in `J20`. Summary: `GanttShellOptions` gained
three constructor-only options (`plugins`, `zoomPresets`, `selectedSegmentIds`); the constructor
applies them through its own existing live setters (`this.plugins = …` etc.) a few statements
*before* its final `this.#phase = 'live'; this.#frames.flush();`, instead of `api/gantt.ts` assigning
`this.#shell.plugins` etc. *after* the `new GanttShell(...)` call returns. All three moved together —
`zoomPresets`/`selectedSegmentIds` were never a separate problem, just the same three lines the
dispatch named. Nothing in `GanttShell`'s construction order needed to change beyond that: every
collaborator a plugin's `setup()` can reach was already built earlier in the constructor, and
`resolveLook`/`Capabilities` already read their registries live at render time rather than a cached
snapshot (J16), so moving the assignment earlier changes nothing but which frame the result first
paints on. Verified via `pnpm exec vitest run src/api/gantt.test.ts` (196/196 pass, no `await`
added to either N7-affected test) and a stable `tsc` count (136, unchanged) before and after.

**Task 2 (the 3 failing tests in `gantt.test.ts`):** all 3 fixed. Two were N7 itself. The third
(`[review P2]`) was a genuine test bug (J20): `barFor()` keyed a bar by `data-kind`, which correctly
reverts to `'leaf'` once a plugin's look is uninstalled — rewritten to key on `data-item-id`'s
`${entryId}:${segmentIndex}` convention instead, stable across a look change. 196/196 pass.

**Task 3 (tsc cleanup), files finished this session, in commit order:**
1. `src/api/gantt.test.ts` + N7 fix (`94053ff`) — J20 (test), the "N7 — FIXED" note (src/).
2. `src/api/dataset.test.ts` (`ef12a66`) — J21. 25 → 0 errors, 49/49 tests pass.
3. `src/layout/frame.test.ts` (`2d4b92e`) — J22. 15 → 0 errors, 46/46 tests pass (one snapshot
   updated, verified as the pre-existing `.kind`→`.look` rename only).
4. `src/view/gantt-shell.test.ts` (`fa9fee4`) — J23. 13 → 0 errors, 35/35 tests pass.
5. `src/data/entry-store.mutation.test.ts` (`ae4a99a`) — J24/**Q6**. 11 → 0 errors, **49/52 tests
   pass** — 3 left red on purpose, reported as Q6 above. Read Q6 before anyone touches
   `entry-store.ts`'s write-refusal guard or `data/rollup.ts`/`data/write-set.ts`.

**Every test deleted or weakened this session, one line each (full detail lives in J20–J24 above —
this is the audit-ready summary the coordinator asked for):**
- `gantt.test.ts` `[review P2]`: **no assertion deleted** — `barFor()` rewritten to key on a stable
  id instead of the now-unstable `data-kind` (J20).
- `dataset.test.ts`: deleted 2 tests for retired `rollUpKinds`/`hierarchy.autoGroup` (feature gone
  end to end, J17); 1 test renamed + narrowed (dropped its `rollUpKinds`/`hierarchy` assertions,
  kept its `childrenOf` claim); 1 test dropped its `entry.kind` half, kept its `props` half; 6 spots
  dropped a dead `kind: 'group'` marker with no assertion change (J21).
- `frame.test.ts`: deleted the whole "milestone floor" describe block (5 tests) — `barSpan`'s
  `diamondSizePx` parameter and `DEFAULT_DIAMOND_SIZE_PX` are gone, ADR 0013's own diamond deletion;
  kept and generalized 2 of its sibling cases that don't depend on a diamond. 2 `groupBy` closures,
  2 column-format closures, and 1 rollup-parent marker rewritten structurally, no assertion lost
  (J22).
- `gantt-shell.test.ts`: no test deleted; 14 dead `kind`/`rollUpKinds`/`isRollUpKind` spots removed,
  zero assertion changes (J23).
- `entry-store.mutation.test.ts`: deleted 1 test for a retired `rollUpKinds` opt-out (feature gone,
  same as `dataset.test.ts`); merged 2 near-duplicate ADR 0012 tests into 1 (no coverage lost, they
  asserted the same thing under two labels); deleted 1 further duplicate of that same merged claim;
  rewrote 1 test's "undo" mechanism from a now-refused manual `update()` loop to
  `replay(invertChangeSet(...))`, assertion unchanged; **left 3 tests red** rather than weaken them
  (Q6) (J24).

**Superseded by J26 below**: `src/data/transaction.test.ts` is now done (0 errors, 44/44 pass, no
write-refusal conflict surfaced there — Q6's second finding above's worry did not materialize for
this file).

### J26 — Build 3b handoff #2: forced stop at ~251k context, `plans/field-redesign/build/build-3-0013-derivation.md` untouched, no boxes ticked

**Raised:** 2026-09-11, Build 3b. **Status:** open — the receiving note for whoever continues, written
at the coordinator's second (non-optional) stop request. Everything below answers that request's five
numbered points directly; committed first, this entry written second, per the coordinator's own order.

**1. N7 — the reorder worked. No shell restructure was needed, and none was attempted.**

`GanttShell`'s constructor already built every plugin-relevant collaborator (`#registrations`,
`#commandRegistry`, `#keymap`, `#segmentSelection`, `#viewport`) before its own final
`this.#phase = 'live'; this.#frames.flush();`. The fix moved *when, within that same constructor*,
three already-existing live setters run — from "after `api/gantt.ts`'s constructor returns" to "a
few statements before this constructor's own last two lines." Concretely:
- `GanttShellOptions` gained three new constructor-only options: `plugins`, `zoomPresets`,
  `selectedSegmentIds` (all optional).
- Inside `GanttShell`'s constructor, immediately before `this.#phase = 'live'; this.#frames.flush();`:
  `if (options.plugins !== undefined) this.plugins = options.plugins;` then the same pattern for
  `zoomPresets` and `selectedSegmentIds` (assigned to `this.selection`). All three moved **together,
  in one place** — the dispatch's question "ask the same of `zoomPresets`/`selectedSegmentIds`" had
  one answer, not three separate ones.
- `api/gantt.ts` now passes `plugins`/`selectedSegmentIds` straight into the `new GanttShell({...})`
  call (spread conditionally) instead of assigning `this.#shell.plugins = …` etc. after that call
  returns; `zoomPresets` was folded into the existing `pickDefined(options, [...])` list since its
  type is identical on both sides. The three post-construction assignment lines `api/gantt.ts` used
  to end its constructor with are deleted outright — nothing depends on them running late any more.
- No other line in either constructor moved. `resolveLook`/`Capabilities` already read their
  registries live at render time (J16: never a cached snapshot), so this reordering changes nothing
  about *what* frame 1 paints once plugins are installed — only *when* installation happens relative
  to that first paint.

Full detail already stands in the "N7" note (marked **FIXED**) and J20 above; this paragraph restates
it because the coordinator asked for it named again at the handoff boundary, not because anything
changed since.

**2. The three `gantt.test.ts` failures — final state: all three fixed, none bent.**

- "a custom milestone barRenderer paints a diamond…" (N7) — **fixed** by the reorder above. No
  `await` added.
- "clearCapabilityRule restores a registered look default (#195)" (N7) — **fixed** by the same
  reorder; verified independently rather than assumed, per the dispatch's own instruction. No
  `await` added.
- "[review P2] two plugins that each define a look both install, both paint…" — **fixed**, but this
  one is a genuine test-helper bug, not N7 (correctly separated in the dispatch itself): `barFor()`
  looked a bar up by `data-kind`, which ADR 0013 makes unstable across a plugin uninstall (a
  dropped plugin's Entry correctly reverts to structural `'leaf'`, so `data-kind` changes under the
  test's own lookup key). Rewritten to key on `data-item-id`'s `${entryId}:${segmentIndex}`
  convention instead — the same DOM node before and after a plugin drop (I8), so it is stable. The
  test's own three assertions (both plugins paint on install; dropping one leaves the other; a
  reinstall-then-drop sequence behaves the same) are unchanged.

`pnpm exec vitest run src/api/gantt.test.ts` — **196/196 pass**, confirmed after the fix, not assumed.

**3. tsc count right now: 65. Command: `pnpm exec tsc --noEmit 2>&1 | grep -c "error TS"`.**

Session start (inherited from J19): 136. After this session's five completed files (`gantt.test.ts`
+ N7, `dataset.test.ts`, `frame.test.ts`, `gantt-shell.test.ts`, `entry-store.mutation.test.ts`,
`transaction.test.ts` — six files, not five; corrected count): **65**. `src/`, `harness/`,
`fixtures/` (non-test) stay at 0 throughout this session — every remaining error is in a `*.test.ts`
file. Breakdown right now (`pnpm exec tsc --noEmit 2>&1 | grep "error TS" | sed 's/(.*//' | sort |
uniq -c | sort -rn`):

```
5 src/layout/frame-layout.test.ts
5 src/data/rollup.test.ts
5 src/data/rollup.property.test.ts
4 src/view/frame-settings.test.ts
3 src/view/gesture-pipeline.test.ts
3 src/data/entry-reader.test.ts
(~30 more files, 1-2 errors each)
```

**4. Every test deleted or weakened this session — full ledger, one line each. Counted per file so
an arithmetic check is possible without re-deriving it.**

- `gantt.test.ts`: **0 deleted.** 1 test's helper rewritten (`barFor`), same 3 assertions kept.
  Before: 196 tests. After: 196 tests.
- `dataset.test.ts`: **2 deleted** ("rollUpKinds setter accepts 'none' and [] as empty-list sugar",
  "live hierarchy.autoGroup changes later first-child promotions only" — both retired-feature tests,
  J21). 1 renamed+narrowed (dropped 2 of its 3 assertions, kept 1). 1 dropped 2 of its assertions
  (`entry.kind`, one list entry), kept the rest. 6 more had a dead property deleted with **zero**
  assertion change. Before this session's edit: file did not compile, so no baseline test count
  exists — first runnable count is 49 (this session's own result). `git log -p` on `ef12a66` is the
  only way to see the pre-edit source; there is no earlier "tests: N" number to check this against.
- `frame.test.ts`: **5 deleted** (the whole "milestone floor" describe block: "keeps the Entry
  itself zero-width…", "floors a milestone bar to the rotated diamond…", "honours a custom
  diamondSizePx…", "stamps minimumSpan on a floored milestone bar", "computeFrame's bar and
  GanttShell.reveal's span agree…" — all five tested a `barSpan` parameter and a constant ADR 0013
  deleted outright, J22). 2 of "a minimum painted bar width"'s siblings kept and renamed off
  "milestone" (same floor rule, not diamond-specific). Same non-compiling-baseline caveat as above;
  first runnable count is 46.
- `gantt-shell.test.ts`: **0 deleted.** 14 dead-property removals, 0 assertion changes. First
  runnable count: 35.
- `entry-store.mutation.test.ts`: **2 deleted** ("with rollUpKinds: [], nothing rolls up at all" —
  retired feature, J24; "a childless group stays dateless (ADR 0012)" — an exact duplicate of a
  claim already merged into a differently-named test earlier in the same file, so deleting it drops
  a repeated assertion, not a distinct one). 2 merged into 1 (both asserted "dateless, no children,
  legal" under different `kind` labels — merged, so this reads as a net **2 deleted, 1 added**, not
  a 1-for-1 rename; the 3 delete/merge lines above sum to −3 net over the "roll-up kinds"/"rollup"
  describes). 1 test's undo mechanism rewritten (`replay(invertChangeSet(...))` instead of a manual
  `update()` loop), 0 assertion change. First runnable count: 52 total, 49 passing, 3 failing on
  purpose (Q6) — **not weakened, left red**.
- `transaction.test.ts`: **0 deleted.** 6 dead-property removals (0 assertion change) plus 1
  assertion line dropped (`expect(parent.kind).toBe('group')` — the old kind-promotion side effect,
  which no longer exists; the test's other two assertions, the actual D-S4-17 same-commit-rollup
  claim, are unchanged). First runnable count: 44, all passing.

**Arithmetic check, so the coordinator does not have to re-derive it:** across the whole session,
7 tests were deleted outright (2 + 5 + 2 across `dataset.test.ts`/`frame.test.ts`/
`entry-store.mutation.test.ts`), 3 were merged down to 1 net test (a −2), and every other change in
every file (`gantt.test.ts`, `gantt-shell.test.ts`, `transaction.test.ts`, plus the remaining spots
in `dataset.test.ts`/`entry-store.mutation.test.ts`) removed a dead property or a stale assertion
with **no reduction in the number of distinct claims tested** — the underlying behaviour each
still-standing test names is the same behaviour it named before this session touched it.

**5. Tests where the test was right and `src/` was wrong — left failing, not touched. Full detail
in Q6 above; named again here per the coordinator's numbered list:**
- `entry-store.mutation.test.ts` > `entries.removeSegments (#212, ADR 0010)` > `"a last-Segment
  removal never touches the Entry's descendants (ADR 0012...)"` — `entries.update()`'s write-refusal
  guard (decision 6) also blocks the library's *own* internal `#removeSegmentsFrom()` bookkeeping
  call, not just a consumer's direct write.
- `entry-store.mutation.test.ts` > `rollup (§1.5)` > `"a parent whose span the same transaction
  proposed keeps the proposed value"` — the same guard refuses the exact same-transaction-proposal
  case decision 5's own test protects.
- `entry-store.mutation.test.ts` > `Segment→Entry index review fixes` > `"S1: checking a
  transaction's Segment ids for uniqueness scales with entryCount, not entryCount²"` — a real
  quadratic-time regression (81400 calls measured against a 21450 threshold at n=400), unrelated to
  `kind`/rollup (none of the test's Entries have a `parentId`). Root cause not identified — flagged
  for a bisect of this build's `data/entry-store.ts`/`data/rollup.ts`/`data/write-set.ts` changes.

**Not run this session, per the coordinator's own instruction:** `verify:full`. Only `tsc --noEmit`
and per-file `vitest run` were used to verify each commit.

**Next agent's first move:** `src/layout/frame-layout.test.ts` (5 errors) is the next-largest file,
same pattern. **Read Q6 before touching `entry-store.ts`, `data/rollup.ts`, or `data/write-set.ts`
for any reason** — two real conflicts and one unexplained regression are open there, none yet the
author's call.
