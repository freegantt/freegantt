# Row redesign — build log

**Q** is a question for the author. It waits. **J** is a call an agent made alone, so a reviewer can find it and reverse it.

Write the entry the moment it comes up, not at the end. A session ends; this file does not.

---

## Q1 — do `FieldContext.read` and `FieldContext.durationOf` retire beside `entries.fieldValue`?

**Raised 2026-09-11, in the plan review. Build 1. CLOSED the same day — the author ruled that all three doors go.** The evidence and the caller-by-caller check are in ADR 0017, *Why the three doors go*. #274 closes with them, including the `Duration.unit` half. The text below is the question as it stood.

ADR 0017 rule 5 says `read()` is *the one* value door. Three doors answer the same question at HEAD:

| Door | Where | Refs |
|---|---|---|
| `entries.fieldValue(id, key)` | `src/model/dataset.ts:28` | 77 in 14 files |
| `FieldContext.read(entry, key)` | `src/model/field.ts:283`, `src/data/fields/field-access.ts:126` | 11 call sites + 3 declaration/implementation |
| `FieldContext.durationOf(entry)` | `src/model/field.ts:286`, `src/data/fields/field-access.ts:133` | 13 in 9 files |

**For retiring all three.** `harness/docs/plugin-authoring.html:678-684` — the author-facing page this design already produced — says `entries.fieldValue(id, key)` and `ctx.read(entry, key)` "both retire", and that `entry.read('duration')` is how duration is read. **[#274](https://github.com/Pawel-IT/FreeGantt/issues/274) is open and live**: `field-access.ts:133` answers milliseconds, and the context `extensions/features/inline-editing.ts:118` builds answers whole days. One call reads two units depending on who built it, and `Duration.unit` is never read. #274 was the withdrawn ADR 0014's to close, and it has had no owner since 2026-09-11.

**Against.** No drafted row-redesign ADR asked for these two deletions. A second reviewer ruled on 2026-09-11 that removing them is out of scope, and corrected `plans/02:467` to say the member stays. It grows Build 1 by 27 sites on top of the 77 the rename already carries.

**Recommendation: retire both.** `entry.read('duration')` makes the unit single by construction, and #274 has no other closer on the board.

**Ruled: retire all three.** The deciding fact was the third caller — `inline-editing.ts:109-126` hand-builds a `FieldContext` whose only two members are `read` and `durationOf`, so putting both on the row deletes the function outright.

**The ruling stands, and `Q7` carries out the part of it the caller check got wrong.** That check claimed every caller holds, or will hold, a live `Entry`. Three of the five do not, and none of them can. See `Q7`.

---

## Q2 — do the renderer contexts become generic over `TProps`? — DEFERRED to #284

**Raised in ADR 0017's own `open:`. Sharpened 2026-09-11. Build 1. Answered the same day, and deferred to [#284](https://github.com/Pawel-IT/FreeGantt/issues/284), after Build 4.** No build in this redesign waits on it.

`ColumnCellRendererContext.entry?: Entry` and `fieldValue: unknown` carry no `TProps` (`src/model/field.ts:67-74`).

**What the gap costs today.** `harness/planner.ts` pays it six times: `entry.props as PlannerEntryProps` at `:69`, `:85`, `:174`, and `fieldValue as Instant` at `:104`, `:114`, `:116`. Under `CLAUDE.md`'s stop rule those casts are evidence of an API gap, not a harness problem.

**Why it is not a paragraph.** `model/field.ts` declares `ColumnCellRendererContext`, and `model/` may not import `layout/` (`model-is-leaf`). A generic on a `model/` type is free, but every seam that builds one of these contexts has to pass the argument, and `layout/renderer.ts` builds the Gantt-wide one. That is a reach across three layers on a hot path.

**An accepted ADR already refused this, and that reframes the question.** [ADR 0005](../../docs/adr/0005-fields-are-declared-and-grid-columns-reference-them.md) line 44 says a `FieldContext` *"travels into `layout/` and `view/`, and making those layers generic over one consumer's field map is the second option this ADR rejected above."* The code repeats the boundary at `src/model/field.ts:35-36` and `src/model/dataset.ts:26-27`, so it is live. [#144](https://github.com/Pawel-IT/FreeGantt/issues/144) settled it and is closed.

**So the real question is narrower:** does ADR 0017's `Entry<TProps>` change the facts that refusal rested on? ADR 0005 rejected making the *layers* generic. ADR 0017 puts `TProps` on the *object*. If a context can hold an `Entry<TProps>` without the surrounding `layout/` functions becoming generic, the refusal may not reach this case. If it cannot, ADR 0005 stands and `Q2` closes as refused.

**ADR 0017's *Open* undercounts the surface.** It names two renderer contexts. `entry?: Entry` appears at seven sites: `model/field.ts:68`, `layout/renderer.ts:47`, `view/gantt-shell.ts:227`, `view/gantt-dom.ts:65`, `render/dom/index.ts:64`, `api/command.ts:131`, `extensions/features/context-menu.ts:34`. Not all of them want `TProps` — establishing which do is part of the answer.

**Answered 2026-09-11. No prototype was run, and none is needed yet. The author accepted the defer the same day: it is settled on [#284](https://github.com/Pawel-IT/FreeGantt/issues/284), after Build 4, and no build in this redesign waits on it.**

**[#284](https://github.com/Pawel-IT/FreeGantt/issues/284) does not close this.** It types **plugin** keys through an ambient interface merge (`PluginEntryProps`). Q2 asks about the **consumer's** keys at the **renderer** seam. Two different holes. All six casts above are consumer keys or core values, so #284 removes none of them.

**But #284 carries the route this question wants.** An augmented interface is not a type parameter. So it types `entry.props` with no generic in `layout/` or `view/`. ADR 0005 rejected generic layers. It never ruled on an ambient merge. The deleted handoff told its agent to prototype the generic, which is the option ADR 0005 already refused.

**That route has one cost, and #284 names it.** An ambient merge types every `Dataset` in the compilation unit. Two Datasets of different shapes then both carry both key sets. #284 accepts that for plugin keys, which a plugin owns. Consumer keys are the case `Dataset<TProps>` exists to keep apart, so the cost lands harder here.

**Recommendation: do not build it in this redesign.** Build 1 renames `Entry` across 1046 references, and the meaning inverts while `typecheck` stays green. #284 threads types through `Entry.props`, `PropsEdit` and `EntryEdit` — the same public types Builds 1 and 2 rewrite. #284 itself says *"Do not build this now."* Settle Q2 after Build 4, when those types hold their final shape, and settle it on #284's issue rather than here.

**Until it is answered:** Build 1 leaves the `fieldValue as Instant` casts at `:104`, `:114` and `:116` exactly as they are. **Do not tidy them** — tidying hides the evidence, and `ColumnCellRendererContext.fieldValue` is the seam this question is about.

**Three of the six are not Build 1's to leave.** `:69`, `:85` and `:174` are `entry.props as PlannerEntryProps`, and Unit D takes `props` off the read surface — they stop compiling. They become `entry.read(...)`, still untyped until this question answers. The evidence does not weaken: an untyped `read` is the same gap the cast was.

---

## Q3 — what is the hierarchy seam called?

**Raised in ADR 0020's own `open:`. Build 4. RULED 2026-09-11: the seam is the hierarchy source.**

The author accepted the draft word. The call site is `ctx.hierarchy.setSource((next) => (entry) => …)`, beside `ctx.edits.setExtender` on the `data` half — the namespace came later the same day, in `J7`. The concept keeps the name the author ruled.

`CONTEXT.md:47` still defines the Hierarchy as the tree via `parentId`. Build 4 edits that entry: the tree is what the hierarchy source answers, and `parentId` is core's own source.

---

## Q4 — which error does a misplaced plugin raise, and what does it say?

**Raised in ADR 0019's own `open:`. Narrowed 2026-09-11. Build 3. RULED the same day: `PluginSetupError`, and the message says where to install it.** The recommendation below was taken whole. No new error type ships.

A plugin with a `data` half, handed to a `Gantt`, has arrived too late to declare a Field.

**The narrowing.** A silent install of the `view` half alone is refused. It gives an author a Gantt that paints variants for a Field that was never declared, and every `entry.read(key)` answers `undefined`. So the answer is a throw. What is open is only which error, and what it says.

**Recommendation:** `PluginSetupError`. It already names a plugin id, and `extensions/install-dataset-plugins.ts:124` already unwinds the plugins installed before it. No new type is needed. The message must say where to install it.

---

## Q5 — which rule wins when two plugins both answer yes?

**Raised in ADR 0018's own `open:`. Build 2. CLOSED 2026-09-11. Half of it was never open, and the author said so.**

**What sets the order was decided on 2026-09-01: `requires`.** D-S5-31 — `plans/s5-extensibility-and-editing/README.md` Q19, `plans/01:892`. A plugin declares `requires: readonly PluginId[]`, and the host topologically sorts the installed set by that graph before any `setup` runs (`extensions/install-dataset-plugins.ts`, `resolveSetupOrder`). `[a, b]` and `[b, a]` install identically. A missing prerequisite throws `MissingPluginError`, a ring throws `PluginRequirementCycleError`, and **there is no `PluginOrderError`, because there is no wrong order left to write.**

So the order is inferred, not authored. Two plugins with an edge between them are already ordered. **Two plugins with no edge are siblings, and `plans/01:892` states the rule for them: siblings must not depend on load order.** A sibling collision is an authoring error, and the double-claim diagnostic is what names it. That is the diagnostic's whole job.

[ADR 0019](../../docs/adr/0019-one-plugin-one-install-site.md) is what carries this to variants. Today a variant is registered by a Gantt plugin, and a Gantt plugin's order is array order. After 0019 one plugin holds both halves and one `requires`, so one resolved order serves the `data` half and the `view` half together.

**What is still open is one word: which end of that order wins.** The codebase says both things today.

| Seam | Rule at HEAD |
|---|---|
| `registerClaim(look, claim)` (`produce-items.ts:134-137`) | **newest wins**, and disposal restores the one before it |
| `register(look, producer)` (`:138-144`) | **newest wins** — it replaces whatever the look resolved to |
| `claimedLookFor(entry)` across two different looks (`:188-198`) | **first yes wins** — *"the first yes is the whole answer"* |

**RULED 2026-09-11: the newest wins.** All three seams agree, and it matches what `requires` means. `b.requires = ['a']` says b builds on a, so b installs second — and b is the one that should be able to override. Under first-wins, declaring a dependency made you lose, which reads backwards.

**Build 2 changes `claimedLookFor`, and two things ride on it.**

- **Core registers its own two variants first, not last.** Every draft said *"registered last"*, which was right under first-wins: last meant fallback. Under this ruling last would mean **core beats every plugin**, which is the opposite of what `parent` and `leaf` are for. ADR 0018, `plans/row-redesign/README.md` and the authoring page are all corrected. The `leaf` variant carries no `when`, so it answers for every row and the floor stays total.
- **Walk newest-first and stop at the first yes.** Do not walk oldest-first and keep the last yes. `claimedLookFor` runs on every hover change, where the budget is zero allocation and the early exit is the point (`produce-items.ts:182,197`). Reversing the walk keeps the early exit at the same cost. A reporter still walks the whole list — a diagnostic has to see both claimants.

The double-claim diagnostic stays. `DoubleLookClaim`, `LookClaimant` and `ReportDoubleClaim` survive the rename, because two sibling plugins with no `requires` edge can still both answer yes, and that is an authoring error worth naming.

---

## R1 — `duration` gets a member, and rule 4 is about cost

**Ruled by the author, 2026-09-11, in the plan review.** Applied to ADR 0017.

The author asked why duration is not `entry.duration()` "so we're consistent with everything else". Two things came out of it.

**Core declares six Fields** (`src/data/fields/core-fields.ts:65-105`): `name`, `start`, `end`, `parentId`, `segments`, `duration`. The live `Entry` gave five of them a member and left `duration` reachable only as `entry.read('duration')`. **It was the only core Field with no member**, and it sits beside `start` and `end`, the two values it is computed from. It now has `duration()`. `read('duration')` still works, exactly as `read('start')` works beside `entry.start`.

**Rule 4 was stated wrongly and is now corrected.** The draft said *"a getter answers one value; anything that returns a collection is a method."* Its own interface breaks that twice: `parent()` answers one value and carries parentheses, and `segments` is a collection and is a property. The principle is the **cost**, not the arity — a member that does no work is a property, and a member that computes, walks or allocates carries parentheses. That is why `duration()` takes the parentheses the author wrote: it computes through `time/` and allocates a `{value, unit}` object.

This strengthens **Q1**. With `entry.duration()` on the row, `FieldContext.durationOf` is a third door onto a value the row answers directly.

---

## Q6 — does a segmented Entry's duration count the gaps?

**Raised 2026-09-11, while closing Q1. Build 1. CLOSED the same day: it is an option.** The author took the call site below whole. **The key is `measureDuration`** — the author's ruling left the name open (ADR 0017's *Open*), and `J12` settled it the same day.

Core answers the **span** today — `diffMs(entry.end, entry.start)` (`src/data/fields/field-access.ts:133`), gaps included. ADR 0017 changes nothing about that, and Build 1 must not change it either.

The question surfaced from a comment that is itself wrong. `src/extensions/features/inline-editing.ts:110-111` says *"A segmented entry's true duration is `layout/`'s own `durationOf`, which `extensions/` cannot reach."* **There is no `durationOf` in `layout/`** — grepped on 2026-09-11. But the sentence shows somebody expected the sum of the Segments rather than the span.

This is a Field semantics question, not a door question. It does not block Build 1.

**Ruled by the author, 2026-09-11: it is an option.** Gaps count, or they do not, and the consumer chooses.

**The call site — ruled 2026-09-11.**

```ts
new Dataset({ entries });                               // default: 'span' — end minus start, gaps counted
new Dataset({ entries, measureDuration: 'segments' });  // the sum of the Segments, gaps not counted
```

**Why a string union and not `durationIncludesGaps: boolean`.** A boolean reads well today and ages badly. A calendar-aware third answer is plausible at S7 — duration in working time, skipping weekends — and a union takes `'working'` later without deleting a published key. Two states that may become three want a union.

**Why the Dataset and not the Gantt.** Duration is a Field, Fields belong to the Dataset, and the Rollup reads duration before any Gantt exists. A view may not change what a value **is**. Two Gantts on one Dataset must agree on it (I2).

**Default is `'span'`**, which is what `field-access.ts:133` ships. Nothing changes for an existing consumer.

**What Build 1 does:** `entry.duration()` reads the Dataset's setting. Delete the wrong comment with the shim.

---

## Q7 — what reads a Field off a row the store does not hold?

**Raised 2026-09-11, in the author's plan review. Build 1. RULED the same day. Unit D is unblocked.**

**The ruling — the read binds to the pass, and the pass carries its own children.**

```ts
interface FieldContext {
  readonly timeZone: string;
  /** The children of the row this pass is computing. It walks, so it carries parentheses. */
  children(): readonly StoredEntry[];
}

interface RollUpContext extends FieldContext {
  readonly field: FieldKey;
  values(key?: FieldKey): readonly unknown[];        // `ctx.field` by default
  numericValues(key?: FieldKey): readonly number[];
  durations(): readonly (Duration | undefined)[];
}
```

- **A `compute` Field keeps two arguments.** `compute: (entry, ctx) => …`. `entry` is a `StoredEntry`, because the row may be hypothetical. A `compute` that needs the tree reads `ctx.children()`. **This closes [#214](https://github.com/Pawel-IT/FreeGantt/issues/214)** — a computed value may depend on the children.
- **One name, both contexts.** `RollUpContext` extends `FieldContext`, so an Aggregator and a `compute` Field say `ctx.children()` for the same thing. The earlier draft of this entry proposed a `ctx.children` property on the Rollup side alone. It is withdrawn: two shapes under one name is a trap, and rule 4 wants the parentheses anyway.
- **An Aggregator needs no per-child door.** `weightedMeanByDuration` reads `ctx.values()` beside `ctx.durations()`.
- **`diffEdit` needs no door at all.** It calls `readField` directly. It sits in `data/` and already imports `entryAfterEdit` from that same file.
- **`FieldContext.read` and `FieldContext.durationOf` are deleted, as `Q1` ruled.**

**Two alternatives were refused on 2026-09-11.** Hand `compute` an `Entry`-shaped view over the hypothetical row: two things then implement `Entry`, a reader cannot tell which one they hold, and `entry.parent()` walks back into the store and mixes two states with no warning. Or ship no children at all and leave #214 open: it gives up the reason the redesign started.

The question as it stood is below.

---

Q1 ruled that `FieldContext.read` and `FieldContext.durationOf` retire into `entry.read(key)` and `entry.duration()`. The caller check behind that ruling claimed every caller holds, or will hold, a live `Entry`. **Three of the five do not, and none of them can.** Verified at HEAD.

| Seam | The row it reads | Why a live `Entry` cannot answer |
|---|---|---|
| the Rollup's Aggregator (`rollup.ts:262-279`, `aggregators.ts:14,51`) | `effectiveEntry(childId, entries, merged, computed)` | `computed` holds what this same bottom-up pass produced for that child. It never reaches the store. |
| the ChangeSet (`change-set.ts:61,72`) | `next = entryAfterEdit(current, edit)` | It is the post-edit row, and no commit has taken it. |
| every `compute` Field (`core-fields.ts:106` is core's own) | whatever `readField` was handed | Both rows above reach it, so a `compute` sees both. |

`entry.read(key)` answers for the row **now**. It serves none of the three.

**This does not reopen the ruling.** Both doors leave the public surface either way. What is open is what replaces them on these three seams.

**The recommendation was taken whole.** It is at the top of this entry.

---

## J3 — the planner brief was deleted once the plan existed

**2026-09-11, on the author's question. Done.**

`HANDOFF-PLANNER.md` was a brief addressed to a planner: *"You are a planner. Write the build plan."* The plan exists, so the brief has no reader left. An implementer reads `build/`, and a brief sitting beside it is one more document that can disagree with the plan.

**It was already costing maintenance.** Two agents corrected the same file on 2026-09-11 — its repo state, its sequencing question and its scope table were each stale within hours of being written. Every fact in it was duplicated in `build/` or in [`README.md`](README.md), and duplicated facts drift. This session fixed three live docs that drifted exactly that way.

**Nothing was dropped.** Four traps it carried alone were moved into [`build/README.md`](build/README.md): the plugin-authoring page is not typechecked, `props` merges per key, `sentence-length` covers 15 `src/` files only, and `check-vendor-names` scans 496 files. One deferred work item — extend `scripts/check-doc-examples.mjs` to `harness/docs/plugin-authoring.html` — was handed to Build 4, which is the last build and the first point at which that page describes `src/`. Hard rule 10 is why: a defer nobody receives is a deletion.

Git history holds the brief and both rounds of corrections.

---

## J1 — ADR 0014 was deleted, not left in place as history

**2026-09-11, on the author's instruction. Done.**

The author asked for ADR 0014 to be removed outright, so no reader can mistake a withdrawn draft for the design. The file is deleted. Three things it held were real and were rehomed rather than dropped: the one read door and #274 went to ADR 0017 (see Q1), the live-install hazard went to ADR 0019, and the undeclared-key rule was already in ADR 0011 and `CONTEXT.md`.

`docs/adr/README.md` now answers the numbering gap and records why the withdrawal was right. The number is not reused. Working material under `plans/field-redesign/` still names ADR 0014 — it is history, and its links reach that note.

---

## J2 — the `Entry` rename was added to the scope inventory

**2026-09-11, in the plan review. Done.**

The handoff's scope inventory counted `fieldValue` at 77 and omitted the `Entry` rename entirely. HEAD's `Entry` becomes `StoredEntry` and a new type takes the name: **1046 references in 118 files**, 650 in 68 excluding tests.

It is the largest job in Build 1, and `CLAUDE.md`'s rename recipe does not protect it — the old name stays valid with a new meaning, so `pnpm typecheck` stays green while the meaning inverts. Build 1 carries the sequence that makes it safe: rename the stored type alone and go green, then declare the live type, then flip the seams.

---

## J4 — the author's plan review was applied to the ADRs and to `build/`

**2026-09-11, on the author's review. Done.** Ten findings, every one verified against HEAD before it was applied. Nine were mechanical. One opened `Q7`.

| # | Finding | Where it was fixed |
|---|---|---|
| 1 | The ADR and `build/` disagreed on the three read doors | Already closed for `build/`. ADR 0017 rule 5 still said *"only the first is decided"* — corrected. `plans/02:467` and `harness/docs/plugin-authoring.html` corrected. |
| 2 | `Aggregator` losing `children` fights keeping `values()` | The Rollup's children are **effective** rows, `computed` included. The list moves onto `ctx`, never onto `parent.children()`. This is what opened `Q7`. |
| 3 | Unit A's blind rename would have renamed the live `Entry` on the authoring page | Unit A now excludes `harness/docs/`, and the `→ 0` grep gate is scoped to declarations and imports. |
| 4 | Unit E could not be done on `rollup.ts` | `collectTouchedIds` reads a stored map and a write shape. Moved to Build 4. |
| 5 | `fieldFor` is not a question about the row | It is `dataset.field(key)`, and a row holds no registry. It stays on `CapabilityInputs`. |
| 6 | Q2's "leave the six casts" would not compile after Unit D | The three `entry.props` casts become `entry.read(...)`. The three `fieldValue as Instant` casts stay — they are the evidence. |
| 7 | Layout tests fabricate plain objects, and `layout/` may not import `data/` | Unit B now owes a `model/`-level test double, and Unit C owes the deletion of `frame-memory.ts`'s `#parentIds`. |
| 8 | "Refuted item N" pointed at two different lists | Every citation now names its file. |
| 9 | The open-question inventory did not match across four files | `build/README.md` now lists the `Q` ids and matches `BUILD-LOG.md`. |
| 10 | Eight smaller traps | Rule 4's stale first statement, `field.ts:303` → `:333`, the third `childrenOf` at `gantt-shell.ts:1142`, `#hasChildren` staying private, `read('parentId')` never answering the tree, ADR 0018's `=== 0` on a `{value, unit}`, two more stale spots on the authoring page, and `CONTEXT.md:44`. |

One finding in the review was already stale when it was written: Build 1's close-out names both #214 and #274.

---

## The 2026-09-11 plan review — `J5`–`J14`

**One review, read against HEAD `66c6b72`, found ten holes in the plugin-author surface and a set of plan boxes that still carried yesterday's sentence beside today's ruling.** The author was away and gave standing permission to decide. So every call below is a **J** — a call made alone, and reversible. **None of them reopens a ruling in `Q1`–`Q7`.** Each one closes a hole those rulings left.

The stale plan text the same review found is fixed in place and is not logged here: Build 2's Q5 boxes, Build 4's precondition pointing at the wrong unit, ADR 0018's opening sentence, ADR 0017's `ctx.children` property, and the `Q2` heading above.

---

## J5 — a `compute` Field keeps its by-key read, and the contexts split by lifetime

**Build 1, Unit D. Done in the plan.**

`Q1` retired `FieldContext.read` and `FieldContext.durationOf`. `Q7` then gave a pass `ctx.children()` alone. Together they left a `compute` Field with no way to read another Field and no way to read a duration: its `entry` is a `StoredEntry`, so it holds `props` and the two dates and nothing else.

**What the gap costs.** `src/data/computed-cache.test.ts:30` is a live `compute` that reads a sibling Field. `src/model/field.ts:224-226` publishes the promise in the type's own doc. An author without the door writes millisecond arithmetic by hand, which `CLAUDE.md`'s time rule forbids outside `time/`.

**The call, in two halves.**

- **Only the `entry` argument retires.** The pass is computing one row, so it asks with no argument: `ctx.read(key)` and `ctx.duration()`, beside `ctx.children()`. `entry.read(key)` stays the one by-key door on a row a caller names.
- **Three contexts, because there are three lifetimes.** `FieldContext` is `{ timeZone }`, one per Dataset. `ComputeContext extends FieldContext` is per pass and carries the three bound members. `FormatContext extends FieldContext` is untouched — it is built once per column resolve and reused for every cell (D-S4-13), so a per-row member on the type it extends would answer the wrong row or force a rebuild on the paint path.

`readField` binds the `ComputeContext`, because it is the one function that holds the row and the registry together. `createFieldContext` keeps the ambient half alone.

**`parseValue` takes the row: `parseValue?(text, ctx: FieldContext, entry: Entry)`** — the shape `formatValue` already has. This is what makes `fieldContextFor()` deletable: `extensions/` holds the Entry, and `{ timeZone: dataset.timeZone }` is public.

**To reverse:** put `read`/`durationOf` back on one `FieldContext` with an entry argument, and give `FormatContext` a per-cell rebuild.

---

## J6 — `VariantRule` is published, and a field match is equality

**Build 2, Unit A. Done in the plan.**

`EntryVariant.when?: VariantRule` shipped a name with no declaration, and the two samples meant two different things — `{ milestone: true }` as equality on a boolean, and `{ 'demo:phaseId': true }` as "has a value". An app author cannot guess which one `{ status: 'blocked' }` follows.

**The call.** `VariantRule<TProps> = FieldMatch<TProps> | ((entry) => boolean)`. A field match compares each named key through that Field's own `equals`, and several keys are AND. **It never means "has a value"** — that question is a predicate. The authoring page's `phaseId` sample is now a predicate.

**`LookClaim` becomes `VariantPredicate`, not `VariantRule`.** `LookClaim` is the predicate arm. Giving it the union's name would ship one type with two meanings, which is the bug this whole redesign keeps finding.

**`EntryVariant` carries `TProps`**, so the ADR's own `entry.read('slack') > 0` sample compiles. `GanttOptions<TProps>` already holds the Dataset's type. `layout/` does not become generic — that is ADR 0005's refusal, and `Q2` still defers the renderer half.

**To reverse:** drop `FieldMatch` and ship the predicate alone.

---

## J7 — the two new plugin doors are namespaced

**Builds 2 and 4. Done in the plan.**

`ctx.addVariant` and `ctx.setHierarchySource` were the only bare verbs on two contexts that are namespaced everywhere else: `ctx.fields.register`, `ctx.edits.setExtender`, `ctx.store.reserve`, `ctx.commands.register`, `ctx.interaction.registerKeybinding`.

**The call.** `ctx.variants.add(variant)` and `ctx.hierarchy.setSource(wrap)`. The concept keeps the name `Q3` ruled — the hierarchy source — and each seam gains a namespace to grow in.

**To reverse:** flatten both onto the root.

---

## J8 — `definePlugin` makes the wrong install site unrepresentable

**Build 3, Unit C. Done in the plan.**

`Q4` ruled the error. A throw at mount is still a runtime refusal of a combination the type can refuse at the call: `definePlugin` sees both halves, and `GanttOptions.plugins` can take `readonly ChromePlugin[]` with `data?: never`. That is the rule a shared `scale` beside a `preset` already follows.

**`PluginSetupError` stays.** The compiler never meets the plain-JavaScript caller or the list a helper widened. A library refuses in both languages it is read in.

**To reverse:** publish one `Plugin` type on both option keys.

---

## J9 — `entry.read('parentId')` answers `parent()?.id`

**Build 1, Units B and E. Done in the plan.**

`parentId` is a core Field, so `read` must answer it — `read` is the one by-key door, and a Grid column goes through it. Build 1 had `read` answering the **stored** field while `parent()` answered the tree, plus a box saying "never write it". Two doors, two answers, one row: a WBS column would print a stale id beside live indentation the moment ADR 0020 lands.

**The call.** A live row answers one tree through every door. `update(id, { parentId })` still writes the stored field, and `StoredEntry.parentId` is still what it wrote. The `→ 0` grep gate on `read('parentId')` is retired; core still prefers `parent()`, because it answers with the row.

**To reverse:** make `read('parentId')` answer the stored field, and keep the ban.

---

## J10 — `entries.all` hands back live rows, and its membership stays committed

**Build 1, Unit B. Done in the plan.**

ADR 0017's table put `all` in the `Entry` column while rule 2 called it committed-only. Both are right, about different questions, and neither said so.

**The call.** *Which* rows exist is the collection's question, and `all` answers it as of the last commit — the array is a `computed` bound to `#revision`, and `ScaleBinding` compares it by reference (D-S1.5-4). *What a row is worth* is the row's question, and every `Entry` answers it now. `has`, `get` and `size` are the live membership doors, and all three follow the write set today; `all.length` never did.

**The review asked for `all: readonly StoredEntry[]` instead, and it is refused.** `gantt-shell.ts:725` hands that array to `layout/`, and `entries-source.ts:55` then rebuilds the tree out of `parentId` — the re-derivation ADR 0020 cannot survive. Stored values stay reachable where they belong: `entry.toInput()` for a copy, and the edit pipeline for an edit.

**To reverse:** type `all` as `StoredEntry[]` and give `layout/` a second, live list door.

---

## J11 — a command context names the resolved variant

**Build 2, Unit E. Done in the plan.**

The owned-id `Set` answers a fifth question the four registrations never reached: `buffer-kind.ts:52` is a command's `when`. Delete the `Set` and the command has nothing to ask; keep it and the harness holds a list the library just made unnecessary; restate the `when` rule inside the command and the harness re-derives the library's own answer. `CLAUDE.md`'s stop rule names that third one.

**The call.** `CommandContextOf.variant?: string` — the variant this Gantt resolved for the Entry the invocation is about. This is not `entry.variant`: a variant is per Gantt (I2), and a command context **is** one Gantt's, off the hot path.

**`EntryVariant.commands` was refused.** A command has an id, a label, a keybinding and a lifetime of its own, and its `when` must also answer when no Entry is named.

**To reverse:** keep the owned-id `Set` in both harness plugins.

---

## J12 — the duration option's key is `measureDuration`

**Build 1, Unit B. Done in the plan.**

`Q6` ruled the option, the union, the host and the default. ADR 0017's *Open* left only the key's name. Read the call: `new Dataset({ entries, duration: 'segments' })` announces a duration where a consumer writes data, and the word already names the core Field and `entry.duration()`.

**The call.** `measureDuration: 'span' | 'segments'`, on `DatasetOptions`. It names the job — how core measures a duration — and spends no third meaning. **It is not a `Field` key**: per Field, two Fields on one Dataset could disagree about what a duration is.

**To reverse:** rename the key to `duration`.

---

## J13 — a `CapabilityRule` predicate may answer `undefined`

**Build 2, Unit C. Done in the plan.**

`CapabilityRule` is `boolean | ((entry) => boolean)` (`view/capability.ts:20`), so a rule that speaks at all must answer every row. ADR 0018 puts that type one level down, on a variant's `can`. A variant's `can: { resize: (entry) => !entry.hasChildren }` then means "not on a parent" **and** says yes to every other row, over the library rule below it.

**The call.** `boolean | ((entry) => boolean | undefined)`, at both levels. `WriteRule` already answers this way, for the same bug on #256, where the harness's own first call site opened every derived cell. `isOffered` already falls through on `undefined`; the predicate's return type is what widens. A bare `boolean` still pins every row.

**To reverse:** keep the two-state predicate and document the override.

---

## J14 — `toInput()` keeps its place, and publishes its caller

**Build 1, Unit B. Done in the plan.**

The review asked for a named caller or a deletion. A copy needs the values a copy stores, `props` included, and `read()` answers a Field and not the input shape. So the member stays and the ADR publishes the line it exists for:

```ts
entries.add({ ...entry.toInput(), id: 'copy-1' });
```

It is not a second read door. Nothing in a renderer, a rule or a capability calls it.

**To reverse:** delete the member, and copy a row from `entries.all`.

---

## J15 — `StoredEntry` moved to its own file, so the live `Entry` has a home with no import ring

**Build 1, Unit B. Done in the code.**

The live `Entry` names `FieldKey` and `FieldValue`, and `field.ts` names `StoredEntry`. Declaring
`Entry` in `model/entry.ts` beside `StoredEntry` made `entry.ts ↔ field.ts` a ring, and
`.dependency-cruiser.cjs`'s `no-circular` rule reads type-only imports (`tsPreCompilationDeps`).

**The call.** Three files instead of two, in one direction:

- `model/stored-entry.ts` — every stored and edit-shaped type, exactly what `entry.ts` held before.
- `model/field-key.ts` — `CoreFieldKey`, `FieldKey`, `CoreFieldValues`, `CoreFieldValue`,
  `FieldValue`. They derive from `StoredEntry`, and both `entry.ts` and `field.ts` name them.
- `model/entry.ts` — the live `Entry` alone.

`field.ts` re-exports the five key types, so no caller outside `model/` changed an import.

**To reverse:** fold the three back into one file, and type `parseValue`'s third argument as
`unknown`.

---

## J16 — `data/` reads Fields through a `FieldAccess`, and `FieldContext` stays `{ timeZone }`

**Build 1, Unit D. Done in the code.**

`J5` split the contexts by lifetime and left `FieldContext` as `{ timeZone }`. A Field read still
needs two things that must never reach a consumer: the registry to look a key up in, and the tree to
walk for `ctx.children()`. Threading both as extra parameters would have touched every `readField`
caller twice.

**The call.** `data/fields/field-access.ts` publishes `FieldAccess` — `{ fields, timeZone,
measureDuration, storedChildrenOf, memo }` — and `data/` passes one wherever it used to pass a
`FieldContext`. `ambientFieldContext(access)` is what a consumer receives. `createFieldContext` is
retired; `createFieldAccess` replaces it.

**`storedChildrenOf` is what makes one `readField` serve two callers.** The store answers with the
children it holds now; a Rollup pass answers with its own effective children, which carry the values
that same bottom-up pass produced (ADR 0017). `readingChildrenFrom(access, …)` binds the second.

**To reverse:** put `fields` and `children` back on `FieldContext` and delete `FieldAccess`.

---

## J17 — the store keeps `storedEntry` and `storedChildrenOf` beside the live doors

**Build 1, Units B and C. Done in the code.**

`entries.get(id)` now answers an `Entry`, and `entries.childrenOf` is deleted. The commit path, the
Rollup and the store's own guards all need the stored row, and `entry.toInput()` is not that.

**The call.** `EntryStore` keeps two internal readers under names that say which half they answer —
`storedEntry(id)` and `storedChildrenOf(id)` — and neither is on `EntryStoreView`, so no consumer
reaches one. `allStored` is the same for the committed array. `#hasChildren` stays private, as the
build file requires; the live row reaches it through the `EntrySource` seam.

**To reverse:** publish `childrenOf` again and drop the `Entry` factory.

---

## J18 — `formatValue` takes the live `Entry` beside `parseValue`

**Build 1, Units C and D. Done in the code.**

`J5` gave `parseValue` a third argument — the live `Entry` it parses into. `formatValue` already had
one, and it was a `StoredEntry`. Its one caller is `view/grid-columns.ts:135`, which after Unit C
holds an `Entry`, so the two halves of one Field would have read two different row types.

**The call.** `formatValue?(value, ctx: FormatContext, entry: Entry)`. Both halves of a Field see the
same row, and `core-fields.ts`'s `formatStart`/`formatEnd` read `entry.start` off it unchanged.
Nothing in `data/` calls `formatValue` — `data/` never formats — so no hypothetical row reaches it.

**To reverse:** type it `StoredEntry` and have `grid-columns.ts` reach for a stored row.

---

## J19 — a positional `hasChildren` argument is gone from `layout/`, and `entry.hasChildren` answers

**Build 1, Unit C. Done in the code.**

`resolveItems`, `resolveLook` and `produceItemsForRow` each carried a `hasChildren` answer beside the
row it was about. `frame-memory.ts` kept a whole `#parentIds` `Set`, rebuilt on every `sync()`, for
the single purpose of feeding the last of them.

**The call.** `resolveLook(entry, registry)` reads `entry.hasChildren`. The `Set`, its rebuild and
the callback all go. `CapabilityInputs` loses `hasChildren` and `descendantsOf` the same way, and
`gantt-shell.ts` stops building three `childrenOf` closures.

**To reverse:** put the boolean back as a positional argument.

---

## J20 — `entries.storedValues` is the one door onto the committed stored rows

**Build 1, Unit C. Done in the code. This closes an API gap, and it is filed under `CLAUDE.md`'s
stop rule rather than worked around.**

`entries.all` hands back live rows (`J10`). One caller must not read now: `GesturePipeline#extraFor`
builds `EditRequest.entries`, which is the state a cascade computes a delta **against** and is
committed-only by contract (D-S5-45). With only `all` on the surface, `view/` would have had to
rebuild a `StoredEntry` per row out of `entry.toInput()` every commit — a re-derivation of what the
store already holds, in exactly the place the stop rule names.

**The call.** `EntryStoreView.storedValues: ReadonlyMap<EntryId, StoredEntry<TProps>>`. The store
hands out its own `#byId` index read-only, so there is no copy and one map identity per commit.

**It deletes a hand-rolled cache.** `gantt-shell.ts` held `#entriesById` plus `#entriesByIdRevision`
and rebuilt the map whenever `datasetRevision` moved, because rebuilding it per rAF frame copied the
whole Dataset sixty times a second (I5). Both fields and the memo are gone: the store's index is
already stable per commit.

**This does not reopen ADR 0017 rule 2.** The refused shape was `all: readonly StoredEntry[]` — the
row list `layout/` receives, which is the one that must stay live or `entries-source.ts` rebuilds the
tree out of `parentId`. `storedValues` is a second, narrower door, named for the one question it
answers, and `layout/` never calls it.

**To reverse:** delete the member and rebuild the map in `view/` from `toInput()`.

---

## J21 — `layout/` states a live row in its own test helper, and no test spreads one

**Build 1, Unit B. Done in the code.**

`layout/` may not import `data/`, and `model/` holds no runtime, so a layout test could not build an
`Entry`. `src/layout/entry-double.ts` answers it: stored values plus a child list, closed over and
handed back as an `Entry`. It imports `model/` and `time/` only, so it proves the seam by
construction — `layout/` never needed `data/`.

**The call.** `entryDouble({ id: 't1', start: 0, end: 10 })` for one row, `entryDoubles([…])` for a
wired set where `parent()`, `children()`, `hasChildren`, `depth` and `descendants()` all answer.

**It also retires a spread that would have shipped a silent bug.** Eleven test sites wrote
`{ ...sampleEntries[0]!, end: … }`. A spread copies own enumerable properties only, so it drops every
getter and every method and still typechecks — finding P2, now real in the suite. `entryValuesOf` and
`entryDoubleLike` are what a test reaches for instead.

**To reverse:** delete the file and hand `layout/` tests plain object literals again, which needs
`Entry` to become a data-only type.

---

## J22 — `fixtures/sample-dataset.ts` publishes the stored rows beside the live ones

**Build 1, Unit B. Done in the code.**

`sampleEntries` is `entries.all`, which hands back live rows (`J10`). One layout test describes a
*change* — `ChangeSet.added[].entity` — and that position carries a `StoredEntry` by contract
(D-S5-45).

**The call.** `sampleStoredEntries`, read once off `entries.storedValues` (`J20`). A test that asks a
question about a row now takes `sampleEntries`; a test that describes a change takes
`sampleStoredEntries`.

**To reverse:** delete the export and rebuild the row in the one test that needs it.

---

## J23 — `DatasetOptions.measureDuration` is the public door onto the duration policy

**Build 1, Unit B. Done in the code.**

`Q6`/`J12` ruled the option and its name. `DatasetStateOptions` carried it already; the public
`DatasetOptions` did not, so no consumer could set it. `api/dataset.ts` spreads its options into
`DatasetState`, so the key is the whole change.

**To reverse:** delete the key from `DatasetOptions`; the internal default stays `'span'`.

---

## J24 — a "before" reading in a test is a value held, never a row held

**Build 1, tests. Done in the code.**

Two `data/` tests failed after the live row landed, and both were right to. Each held
`state.entries.get('p1')!` as a "before" snapshot, then asserted the row had changed. One `Entry` per
id and every read live (ADR 0017 rule 2) makes that assertion compare a value with itself.

**The call.** The tests capture `start`/`end` values before the edit, not the row. This is the live
row working, so the tests state the new rule rather than reach for a stored copy.

**To reverse:** nothing to reverse — a stored copy is what `entries.storedValues` is for, and neither
test needs one.

---

## J25 — `DurationMeasure` leaves `model/` on the public surface

**Build 1, the gate. Done in the code. This closes an API gap.**

`J23` put `measureDuration` on the public `DatasetOptions`. The union it takes stayed internal, so
`pnpm api-report` warned `ae-forgotten-export`, and a consumer who wanted to name the type — a
config object, a wrapper's own option — had no name to write.

**The call.** `src/api/index.ts` exports `DurationMeasure` beside `Duration`. A public option always
publishes the type it takes.

**To reverse:** drop the export and inline `'span' | 'segments'` at the option.

---

## J26 — a test that reads a passenger key declares it, and proves the passenger through `toInput()`

**Build 1, tests. Done in the code.**

`api/dataset.test.ts`'s *"types props from one TProps generic"* read an undeclared key through
`read`. `entry.read` refuses a key no Field declares (ADR 0017 rule 5), so the test was asserting a
door that is gone.

**The call.** The test declares `team` as a Field and reads it through `entry.read`. A second key,
`note`, stays undeclared and keeps the half of the title that is still true: `TProps` types a
passenger key, the row carries it, and `entry.toInput().props` is where it reads back. So the test
now states both rules instead of one deleted one.

**To reverse:** nothing to reverse — an undeclared key has no read door.

---

## J27 — a missing id has one door, and the read door never names one

**Build 1, tests. Done in the code.**

`api/dataset.test.ts` held `describe('entries.fieldValue')` with a *"throws `EntryNotFoundError` for
a missing id"* case. The door is deleted, and the block was the gate grep's last live hit.

**The call.** The block is `describe('entry.read — the one value door (ADR 0017)')`. The missing-id
case becomes `entries.get('missing')` answering `undefined` and `entries.has('missing')` answering
false — the two existence doors ADR 0017 keeps. No error names a missing id any more, because a
caller that holds no row never reaches a read.

**To reverse:** nothing to reverse — `EntryNotFoundError` still ships, and the write door still
raises it.

---

## J28 — a live row seeds its last stored values at construction

**Build 1, tests. Done in the code. This closes a gap the owed tests found.**

ADR 0017 says an `Entry` for a removed id keeps its last values, and `live-entry.ts:51` said the
field was *"seeded at construction"*. The constructor did not seed it, so a row that was fetched but
never read answered `''` for `name` and `undefined` for every date once its id was removed. The
comment stated the contract; the code did not keep it.

**The call.** The constructor reads the store once — `this.#last = source.storedEntry(id)`. It costs
one index read per id, once, and it makes the guarantee unconditional: a gesture that holds a row
across a removal always reads a sane name.

**To reverse:** drop the constructor line, and reword the comment to *"seeded on the first read"*.

---

## J29 — the computed-field memo stands down while a transaction is open

**Build 1, tests. Done in the code. This closes a real staleness bug.**

`ComputedFieldCache` keys on `#datasetRevision` (D-S4-10), which does not move until a commit lands.
So a `compute` Field read inside an open transaction answered the **committed** value for a
hypothetical row. A probe proved it: read a parent's `compute` Field once, open a transaction, rename
a child, and the parent still answered with the old child's name. ADR 0017 requires the opposite —
*"A `compute` Field reads the hypothetical row, not the store"* — and this is the test `Q7` exists
for.

**The call.** `DatasetState`'s memo callback answers `undefined` while `openTransactions > 0`.
`readField` already treats a missing memo as "compute it", so one condition is the whole change. It
also protects the Rollup: that pass reads effective rows the store does not hold, and memoizing one
under the committed revision would have poisoned the cache for every later read of that id.

**To reverse:** hand the memo back unconditionally, and accept a stale read inside a transaction.

---

## J30 — the `childrenOf` gate grep is not a zero, and three names stay

**Build 1, the Gate. Done in the code.**

The build file asks for `grep -rn '\bchildrenOf\b' src/ harness/ | wc -l` → 0, and records that two
internal names are not the deleted public door. Read at the end of Build 1, five kinds of hit remain.
Three stay, and two were wrong prose and are fixed.

**What stays, and why each name is right at its own call site:**

- `data/entry-tree.ts:104,109` — a **callback parameter** on `descendantsOf(id, childrenOf)`. Read
  the call aloud: "descendants of this id, through this children-of lookup." It names the question
  the caller answers, and no public door shares the name any more.
- `layout/rows/sort.ts:37-71` — a **local `Map` of Rows**, not of Entries. `layout/` cannot reach the
  store, and a Row is a different concept from an Entry (`CONTEXT.md`).
- `layout/entry-double.ts` — `DoubleTree.childrenOf`, the private wiring one test double asks its
  set. Same reasoning as the parameter above.
- `data/live-entry.ts:6` and `harness/docs/plugin-authoring.html:166,700` — prose that names the
  **deleted** door on purpose, to say what replaced it. Deleting the word there deletes the
  explanation.
- `#childrenOfWriteSet` stays, as the build file requires: ADR 0020 depends on its cost shape.

**What was fixed:** `data/entry-store.ts:317,345,390` named `childrenOf` as a live store door. The
store's reader is `storedChildrenOf` (`J17`), so the prose now names that, and the read-your-own-writes
sentence names `get`/`has` and the live row instead. Four test titles named the deleted door while
their bodies already called `entry.children()` or `storedChildrenOf` — the titles now say what the
test asserts.

**The ruling.** The gate stays a **read**, not a number. A grep on a bare word cannot tell a deleted
public door from a well-named local, and driving it to zero would cost three good names.

**To reverse:** rename the three, and the grep reads zero.

---

## J31 — a live row answers `JSON.stringify`, and the harness export names the copy door

**Build 1, the `harness/main.ts` review. Done in the code. This closes an API gap.**

`harness/main.ts:306` exported the Dataset with `JSON.stringify(dataset.entries.all, null, 2)`.
After the live row landed, every value on a row is a getter, and `JSON.stringify` reads own
enumerable properties only. So the export wrote `[{"id":"entry-1"}, …]` — every name, date and
Segment silently gone, with no error and no type complaint. A consumer hits this the first time they
persist a Dataset.

**The call, in two halves.**

- `harness/main.ts` names the copy door the library publishes: `entries.all.map((entry) =>
  entry.toInput())`. That is the shape `new Dataset()` takes, which is what the comment beside it
  already promised. This is the harness calling the library, not compensating for it.
- `LiveEntry.toJSON()` delegates to `toInput()`, so the platform hook cannot lose data for the
  consumer who does not know to call it. `EntryDouble` answers the same way, so a test double and a
  live row serialize alike.

**`toJSON` is deliberately not on the `Entry` interface.** ADR 0017 rule 5 keeps one read door and
one copy door, and a third member that hands back stored values would spend that. `toJSON` is not a
name a caller writes — it is the platform calling `toInput()`. Keeping it off the type leaves the
published surface exactly as the ADR drew it.

**To reverse:** delete both methods. The harness line stays correct either way.

---

## J32 — the interaction vocabulary moved to `model/`, so a variant can name it

**Build 2, Unit A. Done in the code.**

`EntryVariant.can` is an `Interactions`, and `EntryVariant` lives in `layout/` beside `ItemProducer`
and `BarRenderer`. `Interactions` lived in `view/capability.ts`, and `layout/` may import `model/`
and `time/` only (`.dependency-cruiser.cjs`, `layout-boundary`). So the vocabulary had to move down
or the type could not be declared at all.

**The call.** `CapabilityRule`, `WriteRule`, `GestureCapability` and `Interactions` are now declared
in `src/model/interactions.ts`. `view/capability.ts` imports them and re-exports them, and it still
owns the whole resolution (`resolveCapabilities`, `CapabilityInputs`, `Capabilities`). Nothing about
the seam changed: one file still answers "may this gesture run".

`model/write-verdict.ts` already set this pattern — `data/` computes a `WriteVerdict` and `model/`
declares it, because "only `api/` and `model/` types are public". These four are public types for
the same reason: a consumer writes `interactions: { resize: … }` and now also
`variants: [{ can: { resize: … } }]`.

**To reverse:** put the four back in `view/capability.ts` and declare `EntryVariant.can` structurally.

---

## J33 — a consumer's variant beats every plugin's, whatever order the plugins installed in

**Build 2, Units A and B. Done in the code.**

`Q5` ruled that the newest rule wins. Taken alone, that makes a consumer's `GanttOptions.variants`
**lose** to every plugin: the consumer's list registers in the constructor, and a plugin installs
after it. The build file's own test list asks for the opposite — *"a consumer `variants` entry
overrides a plugin's variant on the same row"*.

**The call.** Resolution walks three ranks, newest-first inside each: the consumer's own variants,
then every plugin's, then core's two. That is the ladder D-S5-11 already states for a renderer —
config beats a plugin beats the library — and `Q5`'s newest-wins rule is what orders each rank
inside itself. The registry has two doors, `addConsumerVariant` and `addPluginVariant`, so the rank
is a fact about who registered, never a knob anybody sets.

**This adds no ordering knob** (D-S5-31). Two plugins are still ordered by `requires` alone, and two
siblings with no edge still collide into the diagnostic.

**To reverse:** collapse the three ranks to one sequence, and a plugin installed late wins.

---

## J34 — a paint that names no content decorates the library's bar

**Build 2, Unit D. Done in the code. This closes an API gap.**

The build file says `BAR_SHAPE_CLASS` goes and `fg-bar-summary` comes from the `parent` variant's
own `paint`. Opened at `render/dom/index.ts`, that was not possible as written: a `BarRenderer`
result **owns** the bar's content, so `applyElementDescription` wipes the label child and the
library stamps no `data-label`. Moving the class into `paint` unchanged would have deleted the label
from every parent bar, and the outside-label placement rule with it.

The same gap already bit the harness. `harness/plugins/buffer-kind.ts` returned
`{ class: { 'demo-buffer-bar': true } }` to tint a bar, and silently lost that bar's label.

**The call.** A paint result that names `text`, `html` or `children` owns the bar's content, exactly
as before. One that names only `class`, `style` or `attrs` says nothing about content, so the
library keeps painting its own label and stamping `data-label`. `render/dom/index.ts`'s
`paintsItsOwnContent` is the one place that rule is written.

Core's `parent` variant is the first caller: `paint: () => ({ class: { 'fg-bar-summary': true } })`,
one frozen object, no allocation on the hover path. `BAR_SHAPE_CLASS` is deleted, and core holds no
table keyed by a variant name.

**To reverse:** make every paint result own the content, and give the `parent` variant a `paint`
that rebuilds the label child itself.

---

## J35 — `resolveLook` and `claimedLookFor` collapse into one door, and `layout/items/` splits in three

**Build 2, Units A, B and D. Done in the code.**

The build file renames `resolveLook` to `resolveVariant` and renames `claimedLookFor` beside it.
Both survive only because the structural fallback sat between them: `resolveLook` was
`claimedLookFor(entry) ?? (entry.hasChildren ? 'parent' : 'leaf')`. Delete the fallback, as Unit B
requires, and the two are one function with two names.

**The call.** One door: `registry.variantFor(entry)`. Core's `leaf` carries no `when`, so it answers
for every row and the floor is total.

**The file split.** `EntryVariant.paint` is a `BarRenderer`, and `layout/renderer.ts` imports
`layout/frame.ts`, which imports item production. Declaring the variant vocabulary inside
`produce-items.ts` therefore closed an import ring that `no-circular` refuses. So `layout/items/`
is three files, each with one subject:

- `item.ts` — `Item`, `ItemProducer`, `wholeEntryItem`, and `VariantItems`, the two questions the
  frame pass asks (`variantFor`, `itemsFor`). It imports `model/` alone.
- `variants.ts` — the variant vocabulary, the registry, and core's own two variants.
- `produce-items.ts` — `resolveItems` and `produceItemsForRow`, which name `VariantItems`.

`LayoutInput.itemProducerRegistry` becomes `LayoutInput.variants`, typed `VariantItems`: the frame
pass never asks how a variant looks or what you can do to it, so it never names the wider type.

**To reverse:** merge the three files and keep two names for one resolution.

---

## J36 — a double claim is two rules from one source, never an override

**Build 2, Unit B. Done in the code.**

Under the old seams, core's `parent`/`leaf` were producers and not claims, so a plugin claiming a
parent row silently overrode core and raised nothing. Under ADR 0018 core's two are ordinary
variants with ordinary rules, so a literal "two rules answered yes" diagnostic would fire on every
plugin variant that lands on a row with children — and on every consumer variant that overrides a
plugin's. Both are the design working, not an authoring error.

**The call.** `'variant-claimed-twice'` fires when **two rules from the same rank** both answer yes,
and never for core's rank. That is exactly `Q5`'s stated case: two sibling plugins with no `requires`
edge between them, whose order nothing decides. A consumer's rule over a plugin's, or anything over
core's floor, is a deliberate override and stays silent.

A variant with no `when` claims nothing at all, so the last-resort variant never collides either.

**To reverse:** report every second yes, and accept a warning on every intended override.

---

## J37 — core's `leaf` registers before core's `parent`, and the order inside that list is load-bearing

**Build 2, Units A and B. Done in the code. This was a live bug, not a tidy-up.**

`CORE_VARIANTS` listed `parent` first and `leaf` second. Both sit in core's rank, and the walk is
newest-first (`Q5`). `leaf` carries no `when`, so it claims every row. Registered second, it answered
before `parent`'s rule ever ran, and **no row was ever a summary**. Seven tests caught it: a parent
row drew the leaf producer's per-Segment Items, so `data-segment-id`, `fg-bar-summary` and the golden
frame snapshot all disagreed with HEAD.

**The call.** The floor registers first. `CORE_VARIANTS` is `[leaf, parent]`, so `parent` is newer
inside core's rank and wins on a row with children. The general rule this states: **a variant with no
`when` must register before every rule it is the floor for.** The ADR says core registers first
against a *plugin*; it never said which of core's own two goes first, and the order is not free.

**To reverse:** swap the two entries back, and no row paints as a summary.

---

## J38 — a consumer's variants install before the first frame, and a live list is not a `DisposableStore`

**Build 2, Unit A. Done in the code. Two bugs in one path, both in `view/gantt-shell.ts`.**

`GanttOptions.variants` painted nothing. A probe (written, run, deleted) showed the registry holding
core's two alone at the first frame, although `addConsumerVariant` had run.

**Bug one: order.** `#installConsumerVariants` sat below `this.#viewport.bind(...)`. That `bind()`
fires its own `onChange` synchronously, and that onChange **is** the shell's first render (the
comment at the call site says so). So the first frame resolved every row before a consumer variant
existed, and nothing invalidated afterwards. The call moved up, to just after the registry is built.

**Bug two: the store.** `#consumerVariants` was a `DisposableStore`, and `#installConsumerVariants`
began with `disposeAll()`. A `DisposableStore` latches: after `disposeAll()`, `add()` disposes its
argument on the spot (`extensions/disposables.ts:15-21`). So the constructor's own first install
retracted every variant it had just added. That type is right for a lifetime that ends once, and
wrong for a list that is replaced live.

**The call.** `#consumerVariantDisposers: Disposer[]`. Retract each one, then map the new list. The
field's own comment names the trap, because the next reader will reach for the store again.

**To reverse:** move the install back below `bind()`, or hand the list a `DisposableStore` again.
Either one makes `variants: [...]` silently paint nothing.

---

## J39 — `renderer-registry.test.ts` loses the per-variant bar slot, and keeps everything else

**Build 2, Unit B. Done in the code. The Group 2 judgement the handoff asked for.**

`RendererByLook` retires (ADR 0018, *Consequences*), so the `bar` point holds one slot like every
other point. Each test in that file was read and decided on its own.

**Deleted — seven tests, all of `describe('the bar point keys on the kind (review P2)')`, plus two in
the first block.** Every one asserts the per-kind map form: `{ buffer: fn }` registering `bar:buffer`,
two plugins each claiming their own kind, a whole-point claim refusing a per-kind one, a refused map
registering none of its kinds, `'*'` answering the kinds the exact slots miss, and a consumer map
resolving kind → `'*'` → default. **That form no longer compiles and the rules behind it are gone on
purpose.** Their subject moved: which rule covers which row is now
`src/layout/items/variants.test.ts`'s *"which rule wins"* block, and a variant's own paint is
`paintFor` in that file's *"what a variant answers about itself"*.

**One deleted test needed a second look, and its guarantee survives.** *"disposing a per-kind
registration twice frees nothing a later plugin claimed"* is #174's regression guard. The same
sequence — dispose, let another plugin claim, dispose again — is asserted at the `cell` point by
*"register returns a Disposer that frees the point for the next claim (#155)"*, which stays. The
shared registration table is the one mechanism both ran through, so nothing is unguarded.

**Kept — six tests, four of them rewritten from `resolveBar(kind, consumer)` to `resolve('bar', …)`.**
Config-over-plugin at `bar`, the plugin fallback naming its id, undefined on both sides, the
`RendererAlreadyRegisteredError` on a second claim of one point, two points not colliding, the
Disposer's lifetime, and config-over-plugin at `cell`/`header`/`tooltip`. The describe title drops
`D-S5-12`, which is the decision this ADR retired.

**In `api/gantt.test.ts` the same judgement ran over the integration half.** The two `#146` tests
stayed, rewritten as two sibling plugins that each add a `buffer` variant with a different `can`:
they prove the shell rebuilds and repaints on `gantt.plugins = [...]`, which no unit registry can.
The three-plugin split they used to stage — one plugin holding the claim, two more registering
defaults for *its* look — is a shape ADR 0018 deleted, so it did not survive the rewrite.

**To reverse:** restore the per-variant `bar` slot, and `RendererByLook` with it.

---

## J40 — a variant's `paint` beats `barRenderer`, because it names the rows it covers

**Build 2, Units A and E. Done in the code. This closes an API gap `harness/planner.ts` exposed.**

The shell resolved a bar's paint as `barRenderer` first, then the variant's own `paint`. Two e2e
specs went red on it, and the harness had already paid for it in config.

**What the harness had to write.** `harness/planner.ts` declared a variant of its own:

```ts
{ name: 'parent', when: (entry) => entry.hasChildren, paint: phaseRail }
```

`phaseRail` returned `undefined`. Both halves re-derive the library. The rule restates core's own
`parent` rule word for word, and the paint exists only to stop the page's `barRenderer` painting
over a row the library already paints. That is the harness compensating for the library, which
`CLAUDE.md`'s stop rule names. It also deleted `fg-bar-summary` from every phase row, because a
consumer `parent` variant with a paint of its own overrides core's.

**The call. The resolved variant's `paint` answers first, then `barRenderer`.** A variant names the
rows it covers, so it is the specific answer. `barRenderer` is the catch-all for every bar no
variant paints — which is exactly what the retired map form's `'*'` entry meant, and the ADR says
so in `GanttOptions.barRenderer`'s own doc. `GridColumn.cellRenderer` over the Gantt-wide
`cellRenderer` is the same rule one seam along.

**D-S5-11 is untouched.** It orders the catch-all: a consumer's `barRenderer` still beats a plugin's
whole-point `bar` renderer. What changed is that a *specific* answer now beats a *general* one,
which no decision had ruled on either way.

**What a consumer loses, and what answers it.** A `barRenderer` no longer paints over a plugin's
variant. To take a row a plugin claimed, declare a variant of the same name: the consumer's rank
beats every plugin's (`J33`), and that says which rows in one place instead of painting over them.

`harness/planner.ts` now states one variant, `checkpoint`. The phase rail is core's.

**To reverse:** put `barRenderer` back in front, and give the planner page its `parent` entry again.

---

## J41 — the generic demo page reads the fixture's own props type, and states none of its own

**Build 2. `harness/main.ts`'s API-gap review, which `CLAUDE.md` requires on every commit.**

**No gap in `src/` this round.** The page's own variant is four clean lines: one `EntryVariant` with
a `when` that reads a Field, no id set, and `gantt.variants = []` to drop it. A probe (written, run,
deleted) checked the one claim Unit A rests on — that `TProps` reaches a rule. It does: a wrong
value type, a predicate reading a declared key, and a foreign `TProps` list are all rejected at
`tsc`. An undeclared key is accepted, and that is the ADR's own `FieldKey` arm, not a hole — a
plugin's `'scheduling:progress'` is a legal match key and sits on nobody's `TProps`.

**One re-derivation found, and closed in the harness.** `main.ts` built its Dataset as
`new Dataset<{ cost?: number; team?: string }>`, a hand-written copy of a type
`fixtures/demo-dataset.ts` already publishes as `DemoEntryProps`. Build 2 made the copy wrong: the
fixture gained `milestone?: boolean`, the copy did not, and the file then carried two different
props types for one Dataset — the copy on line 57, `EntryVariant<DemoEntryProps>` on line 431. The
page now names `DemoEntryProps` and states nothing of its own.

This is a harness fix with no library change behind it, which the stop rule allows: it **removes** a
re-derivation rather than adding one to compensate for `src/`.

**Two known gaps were left exactly as they are, on purpose.** `String(entry.read('team') ?? …)` is
`Q2`/[#284](https://github.com/Pawel-IT/FreeGantt/issues/284), which says do not tidy it — the cast
is the evidence. `sortByName` as a page-local flag is [#254](https://github.com/Pawel-IT/FreeGantt/issues/254),
already filed with its own comment at the site.

---

## J42 — `definePlugin` returns the plugin, and the factory around it stays the author's

**Build 3, Unit A.**

ADR 0019's example reads `const scheduling = definePlugin({ … })` and then installs
`plugins: [scheduling()]`. Those two lines disagree: one makes `scheduling` the plugin, the other
calls it. A `definePlugin` that returned a zero-argument factory could never carry options, and
`lockEntries(['t2'])` takes some.

**The call.** `definePlugin(spec)` returns `spec`. An author wraps it in their own factory —
`export const weekendShading = () => definePlugin({ … })` — which is the shape every harness plugin
already had. One factory call stays one install's worth of state, so I2 holds exactly as before.
The ADR's example gained the arrow, and nothing else.

**To reverse:** make `definePlugin` return `() => spec`, and drop every author factory.

---

## J43 — `api/plugin.ts` is a leaf again, and the view half's context moved out

**Build 3, Unit A. A boundary check forced it, and `typecheck` could not see it.**

`DatasetOptions.plugins` must name the plugin union, and the union names the `view` half. But
`api/plugin.ts` imported `view/`, and `view/` reaches back through `api/command.ts` to
`api/dataset.ts`. So `api/dataset.ts` importing `api/plugin.ts` closed eight rings at once, and
`dependency-cruiser` refused all eight.

**The call.** Three files, three questions. `api/plugin.ts` says what a plugin **is**, and imports
`model/` and `api/dataset-plugin.ts` alone. `api/plugin-context.ts` (the old `api/plugin.ts`) says
what a `view` half **receives**, and keeps every `view/` re-export. `api/dataset-plugin.ts` says
what a `data` half receives. `api/plugin.test.ts` followed its file and is now
`api/plugin-context.test.ts`.

`PluginContextOf`'s second type argument lost its `Dataset` default and now defaults to `unknown`,
the way `PluginContextParts`'s own two already did. No caller in `src/` or `harness/` read that
default: both bound arguments arrive through `PluginContext<TProps>` on `api/gantt.ts`.

**To reverse:** fold `api/plugin-context.ts` back into `api/plugin.ts` and give `DatasetOptions` a
hand-written structural copy of the union.

---

## J44 — a plugin shape takes one context type, not a `TGantt`/`TDataset` pair

**Build 3, Unit A.**

`ChromePluginOf<TViewContext>` and `DataPluginOf<TViewContext, TDataset>` name the context their
half receives, rather than the two classes that context is built from. That is what lets
`api/plugin.ts` stay a leaf (`J43`): the shape never needs to know how `PluginContext` is assembled.
`api/gantt.ts` binds both — `ChromePlugin<TProps> = ChromePluginOf<PluginContext<TProps>>`.

**To reverse:** restate both shapes over `<TGantt, TDataset>` and build the context inside them.

---

## J45 — `DatasetOptions.plugins` leaves the Gantt type unbound

**Build 3, Units A and B.**

`api/dataset.ts` may not name `Gantt`, so `DatasetOptions.plugins` is
`readonly PluginOf<unknown, Dataset<TProps>>[]`. A Dataset never calls a `view` half, so it never
needs the Gantt type to type-check what it holds. A fully bound `Plugin<TProps>` — declared on
`api/gantt.ts`, which sees both classes — assigns into it unchanged, through the same
method-parameter bivariance `GanttShell.plugins` has always relied on.

An author who annotates a plugin annotates the arm (`ChromePlugin`, `DataPlugin`), and both are
fully bound. So the loose form is what the option holds, never what an author writes.

**To reverse:** move `DatasetOptions` onto a file that sees `Gantt`.

---

## J46 — `PluginSetupError` gains a named constructor, not a new type

**Build 3, Unit C. `Q4` ruled the error; this is how the message says where to install it.**

`PluginSetupError`'s one message names a `setup` that threw, and a misplaced plugin never got that
far. `PluginSetupError.wrongInstallSite(id)` builds the same error, same `code`, with a message that
names the Dataset and shows the call. The constructor gained an optional third `message` argument,
which is the mechanism behind it; the two-argument form is unchanged and is still what both
installers raise.

**To reverse:** drop the static and the third argument, and wrap a plain `Error` as the `cause`.

---

## J47 — a Gantt installs the Dataset's plugins beside its own, under one `requires` order

**Build 3, Units A and B.**

One `requires` list covers both halves (ADR 0019), so the Gantt cannot sort its chrome in isolation.
`GanttShell` now holds two lists and installs their concatenation: the Dataset's plugins first, then
this Gantt's chrome. `PluginRuntime.install` sorts the whole list through `resolveSetupOrder` before
it diffs, so a chrome plugin may require a plugin that only has a `data` half.

Three consequences, each deliberate:

- `gantt.plugins` reports this Gantt's own chrome and nothing else, and `uninstallPlugin` refuses a
  Dataset plugin's id with `PluginNotInstalledError`. A Gantt cannot drop what it did not install.
- `ShellPlugin.view` became optional. A plugin with only a `data` half joins the list for the
  `requires` graph and installs as a no-op — no context is built for it.
- `DuplicatePluginIdError` now covers the two lists together. A chrome plugin may not reuse a
  Dataset plugin's id.

**To reverse:** install the Dataset's `view` halves through a second `PluginRuntime`, and keep the
two `requires` graphs apart.

---

## J48 — the `requires` sort moved to `extensions/plugin-order.ts`

**Build 3, Unit A.**

`resolveSetupOrder` and `assertNoDuplicateIds` lived in `extensions/install-dataset-plugins.ts`, and
`PluginRuntime` now needs both (`J47`). They moved to a file of their own, generic over
`{ id, requires? }` and nothing else, so the sort never names a half or a context.
`install-dataset-plugins.test.ts`'s `resolveSetupOrder` block moved to `plugin-order.test.ts` with
it.

**To reverse:** inline both back into `install-dataset-plugins.ts` and re-export them.

---

## J49 — a chrome-only plugin is legal on the Dataset too

**Build 3, Unit B.**

ADR 0019 states `DatasetOptions.plugins: readonly Plugin[]`, and `Plugin` includes the chrome arm.
So `new Dataset({ plugins: [weekendShading()] })` type-checks, and every Gantt bound to that Dataset
gets the shading. `installDatasetPlugins` skips a plugin with no `data` half rather than refusing it.

This is the one door that gives a plugin to every Gantt on a Dataset at once. Installing on one
`Gantt` gives it to that Gantt alone, which is what Unit B protects.

**To reverse:** narrow `DatasetOptions.plugins` to the `DataPluginOf` arm and throw on a chrome-only
entry.

---

## Q8 — does the public `Plugin` name want a different word?

**Raised 2026-09-12, Build 3. Not blocking, and the ADR's name shipped.**

`lib.dom` declares a global `Plugin` interface (the legacy `navigator.plugins` entry), so
`etc/freegantt.api.md` prints ours as `Plugin_2`. An import shadows the global and nothing breaks. A
reader of the report meets a name with a number on it all the same.

The ADR names the type `Plugin`, so `Plugin` is what shipped. The question is whether a reader is
better served by a word with no global behind it.

---

## J50 — `harness/main.ts`'s API-gap review, and the one split it still carries

**Build 3. `CLAUDE.md`'s per-commit review of the harness.**

**No gap in `src/` this round.** Every library call the page makes is one the library already
answers. The page's own plugin now goes through `definePlugin`, like the eight in
`harness/plugins/`, so no file on the page states a plugin shape by hand.

**One split is left, and ADR 0019 made it optional rather than removing it.** `lockEntries()` is a
`data` half with no `view` half, and the page writes a second plugin —
`harness.entryContextActions` — to register the Lock and Unlock commands that read its store. Before
this build that pair was forced: the two contracts could not be one object. It is now a choice, and
the page keeps it for one reason that has nothing to do with the library: both commands write the
page's own log panel through `prependLogLine(log, …)`, and `harness/plugins/lock-entries.ts` is
written as if by a third party.

**The honest close is a harness change, not a `src/` change** — `lockEntries(writeLog)` growing a
`view` half, the way `logEverything(writeLog)` already takes its callback. It is left for the build
that next touches that page, so this one does not carry an unreviewed rewrite of the lock demo.

**To reverse:** put the `ChromePlugin` annotation back on `entryContextActions` and drop the
`definePlugin` call.

---

## J51 — the hierarchy source answers a loose id, and core brands it once

**Build 4, Unit A. Done in the code.**

ADR 0020 writes the seam as `(entry: StoredEntry<TProps>) => EntryId | undefined`. `EntryId` is a
brand, so a plugin reading a `props` key would have to call `entryId(...)` on every answer — and
`CLAUDE.md`'s API rule says input is loose on every way in. A source's answer is a way in.

**The call.** `HierarchySource` answers `EntryId | string | undefined`, the same loose-id spelling
`entries.get(id: EntryId | string)` already uses. `data/hierarchy-source.ts`'s `parentIdFrom(source,
entry)` is the one place the answer is branded, so every reader downstream still holds an `EntryId`.

**To reverse:** narrow the return to `EntryId | undefined` and delete `parentIdFrom`.

---

## J52 — `setSource` takes the `props` shape, so a plugin reads a consumer key with no cast

**Build 4, Unit A. Done in the code.**

`ctx.edits.setExtender` is not generic, and the ADR's own example — `entry.props.phaseId ?? next(entry)`
— does not compile against `StoredEntry<Record<string, unknown>>`: `props.phaseId` is `unknown`. The
sample would have shipped with a cast in it, which is the evidence `Q2` (#284) exists to keep visible.

**The call.** `DatasetHierarchy.setSource<TProps = Record<string, unknown>>(wrap:
HierarchySourceWrapper<TProps>)`. One type parameter with a default, so an unannotated call still
reads the way the ADR writes it, and `ctx.hierarchy.setSource<PhaseProps>(…)` types `entry.props`
with no cast. `api/dataset.ts` casts once on the way into `data/`, under the same "trusted, unchecked
TProps cast" note the class already carries — `data/` holds one erased tree per Dataset.

**This does not reopen `Q2`.** That question is about the **renderer** contexts, and the route it
names is an ambient interface merge. This is a type parameter on one plugin-author method, which
neither `layout/` nor `view/` sees.

**To reverse:** drop the type parameter and let a plugin author cast `entry.props`.

---

## J53 — `collectTouchedIds` reads the former parent for every edit, and the `'parentId' in edit` check is gone

**Build 4, Unit C. Done in the code. This closes a real hole, and it is the one box in the build file
this build did not carry out as written.**

The build file says to keep `'parentId' in edit` as a write-shape check, and to *say what happens*
when a plugin's source reads a `props` key and the row moves with no `parentId` write. What happens
is a stale aggregate: the former parent never rolls up again. That is the exact bug Unit C exists to
fix, arriving through the other door.

**The call.** `collectTouchedIds` asks the source for the former parent of **every** proposed id,
not only the ones whose edit named `parentId`. The check is not "turned into a tree read" — it is
gone, and the invalidation no longer depends on the write shape at all. When the tree did not move,
the former parent is the current parent and was already a candidate, so this costs nothing extra.
Cost stays O(edits) source calls, inside a pass that already copies the dataset once.

**A probe proved it load-bearing.** Restoring the `'parentId' in edit` form turns two cases in
`src/api/hierarchy-source.test.ts` red, and both are moves written as a `phaseId` edit.

**The same hole is closed in the write set.** `WriteSet.stagedParents` was filled from
`edit.parentId`; it is now filled from the source's answer about the staged row, so `#hasChildren`
does not answer a stale `false` for a parent a `props` edit just gave a child.

**To reverse:** put the `'parentId' in edit` branch back, and file the props-key case as a known gap.

---

## J54 — a refused hierarchy answer is a Fault, never a throw, and `ParentCycleError` keeps its own job

**Build 4, Unit B. Done in the code.**

ADR 0020 says a cyclic answer raises a Fault with `by: 'plugin'` and the Entry reads as a root. Two
things had to be decided to write that.

**Which Entry is the root.** Every member of a cycle would lose its place. The Entry whose answer
*closes* the loop reads as a root instead, so one link is dropped and the rest of the chain keeps its
shape. Which link that is follows the Entries' own order, so it is deterministic.

**`by: 'plugin'` is a literal, not a plugin id.** Core composes sources and does not record which one
answered, and `ErrorReporter` is `'core' | 'consumer' | PluginId`. `'plugin'` is what the ADR writes,
and it is honest: core's own source reads a `parentId` that `entries.update` already checked, so a
refused answer can only have come from a plugin. Two new codes ship — `unknown-parent` and
`hierarchy-cycle`.

**`ParentCycleError` stays where it is.** It guards a `parentId` **write** (`#assertParentValid`), and
`parentId` is still stored and still written (Unit B). The walk guard is a second, different job: it
guards a claim, and a claim gets a Fault because refusing to draw would be worse than drawing a
broken tree flat.

**To reverse:** make `checkHierarchySource` throw, and delete the two codes.

---

## J55 — `childCountByParent` is deleted, because nothing called it

**Build 4, Unit B.**

`entry-tree.ts`'s four walks take the source. One of the four — `childCountByParent` — has no caller
anywhere in `src/`, `harness/` or `e2e/`. Threading a source through a function nobody calls would
have shipped one more unused export (the I11 defect B8 lands to catch).

**To reverse:** restore it, taking a `HierarchySource` beside `childIdsByParent`.

---

## J56 — `harness/main.ts`'s API-gap review, and the one gap it closed

**Build 4. `CLAUDE.md`'s per-commit review of the harness.**

**One gap in `src/`, and it was the harness that showed it.** `gantt.reveal(id)` took
`EntryId | SegmentId`, both of them brands, so `harness/plugins.ts` wrote
`gantt.reveal(entryId(MILESTONE_ENTRY_ID))` to hand it a string it already had. Every other way into
the library takes a loose `string` (`entries.get`, `entries.update`, `gantt.collapse`), and `reveal`
decides which reading an id gets by **asking the store**, never by reading the brand — so the type
was stricter than the runtime for no reason. It now takes `EntryId | SegmentId | string`, and both
call sites dropped their branding.

**No gap on `main.ts` itself this round.** Every library call the page makes is one the library
answers. The tree is still `parentId` there, which core's own source reads, so ADR 0020 changed
nothing the page had to restate.

**Two known splits are unchanged, and both are already filed.** `filterTeam` and `sortByName` are
`#254`. The `lockEntries()` / `harness.entryContextActions` pair is `J50`'s, and `J50` states the
honest close is a harness change that this build did not touch.

**To reverse:** narrow `reveal` back to the two brands and put `entryId(...)` back at both call sites.

---

## J57 — every `<pre>` on `harness/docs/plugin-authoring.html` declares how it is checked

**Build 4, the locked-spec edits. `scripts/check-doc-examples.mjs` now covers the HTML page.**

The page's samples had never been typechecked. Extending the gate to it needed a rule for three
shapes on one page: whole modules, `data(ctx)` fragments, and library types quoted for the reader.

**The call.** Every `<pre>` carries `data-check`, and a block **without one fails the script**. A
page where "unchecked" is the silent default goes straight back to where it was. Three modes:
`module` (compiled as written), `plugin-data` (wrapped in a `definePlugin` call, under a preamble the
page states in prose beside the fragments that use it), `type-sketch` (skipped, and counted out
loud). A block may also carry `data-file`, so the page can show two files and the compiler sees two.

**It surfaced eight stale samples on the first run, and every one was real:** a `paint` naming a
`phaseBar` nothing defined; four blocks calling `Dataset`, `Gantt` or `definePlugin` with no import;
a `Dataset` written with an untyped `TProps` and then handed a declared key; an extender returning a
`Map` with unbranded keys; and the hierarchy sample itself, which does not compile without naming the
props shape (`J52` predicted exactly this).

**To reverse:** delete `extractPageBlocks` and the `data-check` attributes, and the page's samples go
back to prose.

---

## Q9 — should `EntryEdits` and `ProposedEdits` key on a loose `string`?

**Raised 2026-09-12, Build 4, by the doc-examples gate. Not blocking, and out of ADR 0020's scope.**

`harness/docs/plugin-authoring.html` told a plugin author *"the runtime owns merging and branding"*.
The first typechecked run of that sample says otherwise: `EntryEdits` is
`ReadonlyMap<EntryId, EntryEdit>` and `ProposedEdits` is `ReadonlyMap<EntryId, ProposedEdit>`, so an
author writing `new Map([['t2', …]])` or `request.proposed.get('t1')` does not compile. The runtime
reads either one fine — a brand is compile-time only.

**Both sides have a case.** `CLAUDE.md` says input is loose on every way in, and an extender's return
is a way in; the page promised as much. Against: a `ReadonlyMap<EntryId | string, …>` collapses to
`ReadonlyMap<string, …>` in a reader's eye, and every caller inside `data/` then brands on the way
out — which moves the cast rather than deleting it.

**Build 4 changed neither.** It corrected the page to say what compiles, and the samples now brand
with `entryId(...)`. That is the evidence, left visible rather than tidied away.

---

## J58 — `descendantsOf` is deleted, because this branch took its last caller

**Review fixes, P2-1.**

`entry-tree.ts`'s `descendantsOf` had one caller on `main`. This branch replaced that call with
`entry.descendants()` and left the function behind — an export nobody reads, carrying the same
unguarded worklist `F1` just fixed one file away, under a doc comment that invites a new caller.
`J55` deleted `childCountByParent` from this same file for this same reason, so the same reasoning
applies here.

**To reverse:** restore it beside `ancestorsOf`, with the `seen` set `LiveEntry.descendants()` now
carries.

---

## J59 — a field match reads the Field registry first, and `fieldFor` is a required port

**Review fixes, F2.**

`valueMatches` called `entry.read(key)` before it looked the Field up. `entry.read` throws on a key
no Field declares, and a `when` match runs on every row of every layout pass, so one typo took the
frame down from inside `layout/`, with nothing between `frame-memory.ts` and the throw.

**The call.** The lookup runs first, and **a key no Field declares claims no row.** J41 said an
undeclared key was "accepted, and that is the ADR's own `FieldKey` arm, not a hole" — `tsc` accepted
it, the runtime refused it. It is now accepted at both ends, and it matches nothing.

**`VariantRegistryPorts.fieldFor` became required to make that honest.** It was optional, so
`undefined` meant both "this registry has no Field registry" and "no Field declares this key". A
registry built outside a Dataset now says which it means with `fieldFor: () => undefined`, and the
suites that match on a key declare that key. Guarding on the optional port instead would have turned
every bare registry's match silently false — `variants.test.ts` proved it, and four of its cases went
red on the first run.

**A plugin still matches on its own key, by declaring it.** The Dataset declares the key, which is
what `harness/plugins.ts:36–46` already does and says: a chrome plugin installs after the Dataset's
registration closes, so the page declares `buffer`, `risk` and `milestone` for it.

**Not done, and deliberate: a typo reports nothing.** Naming it needs a second report port beside
`reportDoubleClaim`, and the answer is live — a Gantt rebound to another Dataset changes which keys
are declared, so a check at registration would report a key that later becomes real. Left for the
Fault pass that F4 and F5 already touch.

**To reverse:** make `fieldFor` optional again, restore `fieldFor?.(key)`, and read the row first.

---

## J60 — a variant resolves to the registration that won, and a last resort never outranks a claim

**Review fixes, F3 and P2-3. One resolution, because the two are halves of one seam.**

**F3: the round trip through the name is gone.** `variantFor(entry)` answered with a string, and
`itemsFor`/`paintFor`/`interactionsFor` looked that string up again. The second lookup answered with
the newest registration of that name, which need not be the one whose rule claimed the row. Two
consumer rules named `'x'` split the rows between them, and the first rule's row wore the second
rule's paint. `items` was the worse half: the whole-entry default is baked in at registration, so a
plugin re-skinning core's `leaf` replaced core's per-Segment producer on every leaf row.

The registry now answers `resolveFor(entry): ResolvedVariant` — name, `items`, `paint` and `can`,
off the one registration the walk stopped at. `VariantItems` (`item.ts`) answers the narrower
`DrawnVariant` (name and `items`), because `paint` names `BarRenderer` and `item.ts` importing
`renderer.ts` closes an import ring through `frame.ts`. `render/dom`'s `resolveBarRenderer` takes the
`Entry` rather than the variant name, which also deletes the `interactionsFor(variantOf(entry))`
double walk in `gantt-shell.ts`.

**P2-3: sorting the floors last, not refusing them.** A registration with no `when` answers yes for
every row at its own rank. A plugin's rank is above core's, so the documented re-skin —
`ctx.variants.add({ name: 'leaf', paint })` — hid core's `parent`, and every summary rail in the
Gantt stopped drawing.

**The call: a rule with no `when` is a last resort, and a last resort never outranks a rule that
states a claim.** The walk asks every claiming rule first, newest rank first, then the floors in the
same order, with core's `leaf` last of all. So the documented re-skin re-skins the floor and leaves
core's `parent` standing, and a variant that means "every row, whatever else claims it" says
`when: () => true` and gets it.

**Refusing it was written first, and dropped.** A `VariantClaimsEveryRowError` thrown at registration
above `CORE_RANK` fixed the same hole, but it retired the re-skin the file documents, it refuses an
ordinary registration where the library's posture is to keep drawing, and its class plus message put
the core bundle 89 B over the 78 kB `size-limit` budget. Ordering costs nothing and keeps both cases.

**To reverse:** drop `statesAClaim` from the `walkOrder` comparator, and put `paint`/`can` back
behind a name lookup.

---

## J61 — core's own `parent` paint answers before a consumer's `barRenderer`, and that is intended

**Review fixes, F21. The behaviour stands; what was missing was the test and the doc.**

`gantt.barRenderer` is never called for a row with children. `F21` reported that as either a bug
against D-S5-11 or an untested decision, and asked for one of the two.

**It is J40, already decided on this branch, and the rule is specificity, not rank.** A variant's
`paint` answers before `barRenderer` **because it names the rows it covers**, and `barRenderer`
names none. Core's `parent` carries `when: (entry) => entry.hasChildren`, so it is such a rule.
Ranking `barRenderer` over it was written, run and reverted here: `e2e/planner.spec.ts` and
`e2e/parent-bar-drag.spec.ts` both went red, because `harness/planner.ts` sets a `barRenderer` and
expects every phase row to keep `fg-bar-summary`. J40 records the same two specs going red for the
mirror-image reason.

**D-S5-11 is satisfied by the rank ladder, not by this seam.** A consumer who wants to paint a
summary row claims it — `variants: [{ name: 'summary', when: (entry) => entry.hasChildren, paint }]`
— and their rule outranks core's, so their paint answers and `fg-bar-summary` goes. That is one line
of config, and it is the door ADR 0018 exists to give.

**Pinned, and said out loud.** Two tests in `api/gantt.test.ts`: a `barRenderer` sees the leaf rows
and not the parent, and a consumer rule claiming the parent paints it. `GanttOptions.barRenderer`'s
own doc now says "every bar no variant paints", and names the rule that claims a summary row.

**To reverse:** publish the resolved variant's owner (a `fromCore` member on `ResolvedVariant` was
written and reverted), and have `gantt-shell.ts`'s `#paintFor` prefer the catch-all when the rule
that won came from core. Expect the two e2e specs above to need the planner's own `parent` variant
back — the one J40 deleted.

---

## J62 — the check is pure, and core raises a refused answer where it happens

**Review fixes, F5.**

`checkHierarchySource` raised its Faults from inside an `alien-signals` `computed`. A computed is
lazy, so the documented rule — "reported once per revision" — was really "once per evaluation, and
only if somebody evaluates". A headless Dataset, which is where a plugin's own tests run, reported
nothing at all.

**The call: the check answers, and the store raises.** `checkHierarchyAnswers(entries, source)` is
pure now. It hands back `{ parents, refused }`, and `refused` is a list of ordinary Error reports.
`EntryStore#reportRefusedHierarchyAnswers()` raises them, and it is called at the three points where
the answers can change: at construction, each time a plugin composes the seam, and on every
revision. Never from a read.

**Why not "move the check out of the computed".** The review's own remedy was to raise from the
commit path. That silences the construction case entirely, which is the only case `F4` reaches — no
commit has happened yet. Both doors are needed, so the report is a separate call at every door
rather than a side effect inside one of them.

**A construction-time refusal reaches the `console`, not an `error` handler.** No consumer can
subscribe before `new Dataset(...)` returns. That is the posture the construction Rollup's own
`derived-values-dropped` report already takes (ADR 0013, decision 5), and the tests read the
fallback for that half.

**Deduped per revision, by message.** A plugin composing the seam checks again inside the same
revision, so the row the consumer mis-parented would otherwise be reported twice at construction.

**The `core` size budget moves 78 kB → 79 kB.** Measured: 77.93 kB before this cluster, 78.18 kB
after — 250 B for `F4`, `F5` and `F6` together. Brotli noise at this scale is ±60 B (removing the
dedupe measured *larger* than keeping it), so there was no honest way to trim into 70 B of headroom.
`J60` rejected a design for 89 B; this is not that case — there is no second design that reports a
Fault deterministically for less.

**To reverse:** give `checkHierarchyAnswers` its `report?: RaiseError` parameter back, call it from
the `#hierarchy` computed, and delete `#reportRefusedHierarchyAnswers` and its three call sites.

---

## J63 — a refused hierarchy answer names whoever answered it

**Review fixes, F4.**

Both hierarchy Faults hard-coded `by: 'plugin'`, so `new Dataset({ entries: [{ id: 'a', parentId:
'nope' }] })` — no plugin anywhere — told the consumer a plugin did it, in words (`the source`) that
`plans/02` calls an expert door.

**The call: the answer names the author, and a flag cannot.** A boolean set when a plugin claims the
seam is wrong, because a source composes: `entry.props.phaseId ?? next(entry)` falls through and
hands back the row's own `parentId`. So core compares the answer with `entry.parentId`. Equal means
the consumer stored that value, and the report says `by: 'consumer'` and names `parentId`. Anything
else is a plugin's own answer, and keeps the old wording.

A plugin that answers with the same id the row already stores is reported as the consumer's. That is
correct: the value is the consumer's, the fix is on the consumer's row, and blaming the plugin would
send them to the wrong file.

**To reverse:** drop the `authored` branch in `refuse` and hard-code `by: 'plugin'` with the source
wording.

---

## J64 — the Rollup reads the store's committed parent index

**Review fixes, F6.**

The Rollup walked the whole Dataset five times per commit, and two of the five were new on this
branch. One of those two re-derived what `EntryStore` already holds: the checked parents of the
committed rows, memoized per revision.

`rollUpFields` now takes a `RollUpTree` — `{ committedParents, source }` — instead of the bare
source. The committed half is the store's index; the source still answers for the effective tree,
which is a tree no revision holds and no index can hold. Four sweeps, and the store and the Rollup
can no longer disagree about who a row's parent was.

**The evaluation this forces is deliberate, not inherited.** Reading `committedParents()` from the
commit path evaluates the `#hierarchy` computed there. Under `J62` that computed raises nothing, so
no Fault fires as a side effect of this change — the commit path reports because
`endTransaction` calls `#reportRefusedHierarchyAnswers()` on purpose.

**To reverse:** put `hierarchySource` back as `rollUpFields`'s sixth parameter and rebuild
`parentOfPrior` with `checkHierarchyAnswers(committed, source)`.

---

## J65 — a variant rule that names an undeclared key says so

**Review fixes, `J59`'s deferred half.**

`J59` made a field match on a key no Field declares claim no row, and left it silent. The rule simply
stopped matching, and nothing said why — a typo and a working rule look the same from the page.

**The call: the rule reports at match time, and the report is a new code.**
`VariantRegistryPorts.reportUnknownFieldMatch` sits beside `reportDoubleClaim`, and `GanttShell`
raises `'unknown-variant-field'` from it. Match time, never registration time: which keys are
declared is live, and a Gantt rebound to another Dataset declares a different set — a check at
registration would report a key that is about to become real.

**Deduped inside the compiled rule, not at the shell.** A rule that names a missing key names it on
every row of every pass, so the shell's own `Set` would allocate a claimant per row on the hover
path. The `Set` lives in `compileRule`'s closure instead: one allocation at the rule's first row,
and nothing after it. The cost is that a rebind which un-declares a key already reported stays
quiet. The first report already said the sentence.

**A rule in `GanttOptions.variants` reports to the `console`, not to an `error` handler.** It
resolves during the constructor's own first paint, which is before any consumer handler exists —
the same trap `Q10`'s own test names for a plugin collision, and the same answer `J62` gives for a
construction-time hierarchy refusal.

**To reverse:** delete the port, the `'unknown-variant-field'` code and its row in
`error-code-drift.test.ts`, and return `false` from `valueMatches` with no report.

---

## J66 — S5's own files keep their words, under a banner that says what replaced them

**Review fixes, the question `F12` left open.**

`plans/s5-extensibility-and-editing/README.md` and `s5.13-gallery-and-gate.md` still name
`GanttPlugin` and `DatasetPlugin`. `F12` fixed `plans/01` §10 and stopped there, and the previous
agent argued these two are slice history rather than locked spec.

**The call: mark them, do not rewrite them.** A slice tracker records what that slice decided, in
the words it decided them in — `D-S5-1` *was* "two contracts, two hosts", and editing that sentence
would make the record say a decision was never taken. But a reader cannot tell history from
instruction with nothing on the page, and `README.md` is where an agent goes for S5's context. So
each file opens with one banner: the pair is retired, `definePlugin` replaced it, and each name maps
to the half it became.

**To reverse:** delete the two banners.
