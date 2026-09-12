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

## Q2 — do the renderer contexts become generic over `TProps`?

**Raised in ADR 0017's own `open:`. Sharpened 2026-09-11. Build 1. Open.**

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

**Raised in ADR 0020's own `open:`. Build 4. RULED 2026-09-11: the seam is `setHierarchySource`.**

It sits beside `setExtender` on the `data` half, and it reads the same way: `ctx.setHierarchySource((entry) => …)`. The author accepted the draft word.

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

**Raised 2026-09-11, while closing Q1. Build 1. CLOSED the same day: it is an option, and the key is `duration`.** The author took the call site below whole.

Core answers the **span** today — `diffMs(entry.end, entry.start)` (`src/data/fields/field-access.ts:133`), gaps included. ADR 0017 changes nothing about that, and Build 1 must not change it either.

The question surfaced from a comment that is itself wrong. `src/extensions/features/inline-editing.ts:110-111` says *"A segmented entry's true duration is `layout/`'s own `durationOf`, which `extensions/` cannot reach."* **There is no `durationOf` in `layout/`** — grepped on 2026-09-11. But the sentence shows somebody expected the sum of the Segments rather than the span.

This is a Field semantics question, not a door question. It does not block Build 1.

**Ruled by the author, 2026-09-11: it is an option.** Gaps count, or they do not, and the consumer chooses.

**The call site — ruled 2026-09-11.**

```ts
new Dataset({ entries });                        // default: 'span' — end minus start, gaps counted
new Dataset({ entries, duration: 'segments' });  // the sum of the Segments, gaps not counted
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
