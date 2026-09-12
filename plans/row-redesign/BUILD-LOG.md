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
