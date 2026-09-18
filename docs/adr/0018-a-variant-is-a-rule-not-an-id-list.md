---
status: accepted — built and green on `row-redesign`, 2026-09-12: `verify:full PASS — all 16 checks green, test:e2e included (70s)`. Opened 2026-09-11, out of a design session on the plugin variant surface. Reworked the same day, after the author ruled that nothing stores a variant. The build is `plans/row-redesign/build/build-2-0018-variants.md`, and the calls made during it are `J32`–`J41` in `plans/row-redesign/BUILD-LOG.md`.
decided: a variant is a rule, and nothing stores one (2026-09-11, author's ruling) — see *Why nothing stores a variant*. `EntryLook` goes away, and a variant name is a `string` (2026-09-11, author's ruling) — see *`EntryLook` goes away*. `when` ships both forms, the field-match shorthand and the predicate (2026-09-11, refuted item 7 in `plans/row-redesign/README.md`). [ADR 0013](0013-what-decides-that-a-row-derives-its-values.md) stands whole: this ADR changes how a variant is registered, and changes nothing about derivation.
amended 2026-09-17 (naming only, no decision changed): the key this ADR calls `can` is now `capabilities`, and the type it calls `Interactions` is now `Capabilities`, matching `GanttOptions.capabilities`, `setCapabilityRule` and `CapabilityRule`. One concept, one word, at every level — and the word `interactions` goes back to naming the `interaction/` layer alone. The ADR text below keeps the names it was written with.
open: nothing. **The newest rule wins** (2026-09-11, author's ruling — `Q5`), so all three registration seams agree and core registers its own two variants first. **What sets the order was never open** — `requires` does, ruled 2026-09-01 as D-S5-31, and [0019](0019-one-plugin-one-install-site.md) carries it to a plugin's `view` half. See *Double-claim arbitration*.
---

> **Vocabulary note, added 2026-09-17 ([#421](https://github.com/Pawel-IT/FreeGantt/issues/421)).** This record predates the `Item`→`Bar` rename ([ADR 0026](0026-the-segment-retires.md)). Read every `Item` below as `Bar`. **Do not rewrite the body.**

# A variant is a rule, not an id list

**Lands after [0017](0017-the-entry-answers-questions-about-itself.md).** A rule needs a row that answers questions.

## Context

A variant costs four registrations today, and each one repeats the same string:

```ts
ctx.layout.registerLookClaim(BUFFER_KIND, (entry) => owned.has(entry.id));
ctx.layout.registerItemProducer(BUFFER_KIND, (entry) => [wholeEntryItem(entry, BUFFER_KIND)]);
ctx.view.registerRenderer('bar', { [BUFFER_KIND]: () => ({ class: { 'demo-buffer-bar': true } }) });
ctx.interaction.registerLookDefaults(BUFFER_KIND, { resize: false });
```

`barRenderer: RendererByLook` on `GanttOptions` is a fifth site for the same name (`api/gantt.ts:154`). A plugin author who writes a claim and forgets a producer gets a variant that draws nothing. The pair is easy to half-write, and nothing catches it.

**The claim answers with an id set, because it cannot answer any other way.** Both shipped examples do it — `harness/plugins/milestone-kind.ts` and `buffer-kind.ts` — and both write the identical producer line, `[wholeEntryItem(entry, KIND)]`. Three problems follow.

- **The set freezes at install.** A row added later never gets the variant.
- **A plugin often does not know the ids.** The page must keep a parallel list and hand it over.
- **The question the claim really asks is a question about the row**, and the claim cannot ask it. `(entry) => !entry.hasChildren && entry.duration()?.value === 0` does not compile today. So the author precomputes the answer into a `Set` and hands the `Set` over.

## Decision

**A variant is a rule. Resolution walks newest-first and stops at the first rule that answers yes** (`Q5`, ruled 2026-09-11). There is no second source and no stored value.

**One variant is one object.** Four registrations become one object, and the name appears once.

```ts
interface EntryVariant<TProps = Record<string, unknown>> {
  name: string; // this variant's identity — the `data-variant` a consumer styles, and the registry key
  when?: VariantRule<TProps>; // a field match or a predicate; omit it on the last-resort variant
  items?: ItemProducer; // default: one whole-entry Item — the line both examples hand-write
  paint?: BarRenderer;
  can?: Interactions; // per-variant capability, one level under the consumer's own
}
```

### What `when` matches

**Published beside the key, because an author cannot guess it.** `{ milestone: true }` could mean "equals `true`" or "has a value", and the two answer differently for `{ status: 'blocked' }`.

```ts
type VariantRule<TProps = Record<string, unknown>> = FieldMatch<TProps> | ((entry: Entry<TProps>) => boolean);

/** Every named Field equals the value beside it. Several keys are AND. */
type FieldMatch<TProps> = { [K in FieldKey]?: K extends keyof TProps ? TProps[K] : unknown };
```

- **A match is equality, per Field.** Each key reads through `entry.read(key)` and compares with that Field's own `equals` (`Field.equals`, `model/field.ts`), which is what makes `{ start: someInstant }` and `{ status: 'blocked' }` behave the same way a Grid comparison does. With no `equals` declared, the comparison is `Object.is`.
- **Several keys are AND.** `{ milestone: true, locked: false }` claims a row that answers both.
- **A match never means "has a value".** `when: { 'demo:phaseId': true }` claims the rows whose `demo:phaseId` **is** `true` — not the rows that carry a phase id. Ask that with the predicate: `(entry) => entry.read('demo:phaseId') !== undefined`.
- **The shorthand is what core can index.** A field match names its keys, so a future pass can group rules by key. A predicate is opaque and runs per row. That is the trade, and the shorthand is the common case (refuted item 7 in [`plans/row-redesign/README.md`](../../plans/row-redesign/README.md)).

**`EntryVariant` carries `TProps`, so the predicate compiles.** `entry.read('slack')` on an `Entry<unknown>` answers `unknown`, and the sample `entry.read('slack') > 0` does not compile. `GanttOptions<TProps>` already has the Dataset's type, so `variants: readonly EntryVariant<TProps>[]` hands it to every rule the app author writes. The registry inside `view/` holds the erased shape and casts once at the façade, the way `api/dataset.ts` already re-types the whole store for `TProps`.

An app author installs a variant with no plugin at all:

```ts
new Gantt({
  dataset,
  variants: [{ name: 'milestone', when: { milestone: true }, paint: milestoneBar, can: { resize: false } }],
});
```

A plugin ships the same object through `ctx.variants.add(variant)`. One type, two doors, one shape.

**The plugin door is namespaced, like every other one on that context.** A plugin context reads `ctx.fields.register`, `ctx.edits.setExtender`, `ctx.commands.register`, `ctx.interaction.registerKeybinding`. A bare `ctx.addVariant` would be the one verb hanging off the root. `ctx.variants.add(variant)` reads as the sentence it is, and it gives the variant seam a namespace to grow in.

**Core registers its own two variants first**, and they are ordinary `EntryVariant` objects with nothing special about them:

```ts
{ name: 'parent', when: (entry) => entry.hasChildren, paint: summaryBar }
{ name: 'leaf' } // no `when` — the last resort, for every row no rule claims
```

**First, not last — the newest rule wins** (`Q5`, ruled 2026-09-11). Core registers before anything else, so every plugin variant and every consumer variant is newer and overrides it. Core is the floor. A `leaf` variant with no `when` is a **last resort**: it answers for every row no rule claims, so the floor is total and no row falls through (`J60`). **Registering core last would make core beat every plugin**, which is the opposite of what its two variants are for.

**A last resort never outranks a rule that states a claim** (`J60`, `P2-3`, ruled 2026-09-12; it supersedes `J37`, which held that the order inside core's own pair was load-bearing). The walk asks every claiming rule first — newest rank first, then newest registration — and only then the last resorts, in the same order, with core's `leaf` last of all. Rank alone put a plugin's floor over core's `parent`, so `ctx.variants.add({ name: 'leaf', paint })` — the documented re-skin — answered for every row and every summary rail in the Gantt stopped drawing. Sorting the floors last makes that registration re-skin the floor and leave every claim standing. Registration order between a floor and a claim now decides nothing, core's own pair included.

**Omitting `when` and writing `when: () => true` are different answers.** Omit it for a last resort, which takes every row no rule claims. Write `when: () => true` for a rule that claims every row outright, core's `parent` included — that one outranks core, because it states a claim.

**A rule reads an `Entry`.** `when` and every `can` predicate receive [0017](0017-the-entry-answers-questions-about-itself.md)'s live row, which is why `!entry.hasChildren && entry.duration()?.value === 0` compiles at all. That is the whole reason 0017 lands first. **Read the duration through `duration()`, not through `read('duration')`.** A `Duration` is `{ value, unit }`, so `read('duration') === 0` compares an object to a number and is always false.

**A variant is a function of the row, and it runs per layout pass** (`layout/items/produce-items.ts:248`). Core caches nothing new. The one input core's own rules read is `hasChildren`, which `#byParent` already caches per commit (`data/entry-store.ts:155-163`). Nothing about a variant can cache on the Dataset, because variants are per Gantt (I2, refuted item 5 in [`plans/row-redesign/README.md`](../../plans/row-redesign/README.md)).

**`name` is an identity, not a value.** It has three jobs, and storage is not one of them. `render/dom/index.ts:1186` stamps it onto the painted element, which `CONTEXT.md:517` publishes as a selector a consumer may style. The registry keys on it. A double-claim diagnostic names it.

**`can` takes the same predicates `interactions` takes.** `KindDefaults` is boolean-only today for one stated reason: _"a registering plugin never sees an `entry`"_ (`view/capability.ts:83-90`). [ADR 0017](0017-the-entry-answers-questions-about-itself.md) hands it one. So the mapped boolean type dies and `Interactions` serves both levels. The resolution order is unchanged: consumer `interactions`, then the variant's `can`, then the library rule. The variant level stays view-level, so refuted item 6 in [`plans/field-redesign/shared/refuted.md`](../../plans/field-redesign/shared/refuted.md) still holds — this is not a second door onto `Field.editable`.

**A gesture predicate gains the answer a write predicate already has: `undefined` — no opinion.** `CapabilityRule` is `boolean | ((entry) => boolean)` today (`view/capability.ts:20`), so a rule that speaks at all must answer every row. Put it one level down and that bites: a variant's `can: { resize: (entry) => !entry.hasChildren }` means "not on a parent", and it also says **yes** to every other row, over the library rule underneath it. `WriteRule` learned this on #256, where the harness's own first call site opened every derived cell by accident. So `CapabilityRule` becomes `boolean | ((entry) => boolean | undefined)`, at both levels, and `undefined` falls through to the next answer. A `boolean` still pins every row, which is what a consumer who wants that writes.

## How an app pins one row

A variant answers from the data. So an app that wants one named row writes the data, in its own words:

```ts
const dataset = new Dataset({ fields: [{ key: 'milestone' }] });

new Gantt({ dataset, variants: [{ name: 'milestone', when: { milestone: true }, paint: milestoneBar }] });

dataset.entries.update('launch', { milestone: true });
```

**This is the whole of what a stored `variant` was going to buy, and it costs core nothing.**

- **The write is an ordinary Field write.** It lands in a `ChangeSet`, it undoes, the write door gates it, and `gridColumns: ['milestone']` shows it. All of that already works, and none of it is new surface.
- **The word is the consumer's.** Core never learns what a milestone is. A shift roster writes `{ handover: true }` and a factory writes `{ changeover: true }`.
- **Two Gantts on one Dataset may paint the same flag differently.** The flag is data and the variant is per Gantt, so I2 holds by construction.
- **[ADR 0013](0013-what-decides-that-a-row-derives-its-values.md) stands whole.** Core adds no classification word to the Entry.

## Why nothing stores a variant

An earlier draft of this ADR gave the Entry a stored `variant`, and resolved a variant in three steps: the stored value, then a rule, then structure. **The author refused the stored value on 2026-09-11.** This section records why, because the refusal is what made the rest of the ADR simple.

**Nothing stores a variant today, and the draft was proposing it, not inheriting it.** `Entry` has no `variant` member (`model/entry.ts:28-45`). `core-fields.ts` declares no `variant` key. `produce-items.ts:249` computes the value per frame, `layout/frame.ts:93` carries it on the geometry, and `render/dom/index.ts:1186` stamps it into the DOM. The type's own comment states the same fact: _"Not a stored Entry classification (ADR 0013)."_

**A stored variant is the stored `kind` that [ADR 0013](0013-what-decides-that-a-row-derives-its-values.md) deleted, under a new word.** ADR 0013 removed it because a row could then say one thing while the data said another. Storing `variant: 'parent'` on a childless row is that exact failure: the row paints as a summary, and it rolls nothing up, because it has nothing to roll up from.

**Guarding the stored value cost more than the value was worth.** The earlier draft needed a reserved-name list, two runtime refusals on the write door, a new core Field key, and a paragraph explaining why `entry.read('variant')` answers a different question from the variant a Gantt paints. All four are gone.

**The pin survives.** *How an app pins one row* above keeps every capability the stored value offered, through a Field the consumer already owns.

**A childless row can still paint as a summary, honestly, two ways.** Register a variant that paints that way — it claims nothing about the data. Or give the row children with [ADR 0020](0020-a-plugin-may-own-the-hierarchy.md)'s hierarchy source, which changes the data's own answer and makes the row a parent in fact. This is the author's "that kind of massive work".

## `EntryLook` goes away

**Ruled 2026-09-11.** `EntryLook` is deleted (`model/entry.ts:11`). Nothing replaces it. A variant name is a `string`.

**The two literals buy nothing.** Core never branches on a variant name. It uses the name as a key in three registration tables, and it writes the name into one DOM attribute:

| Site | What it does with the name |
|---|---|
| `layout/items/produce-items.ts:173` | keys the two built-in Item producers |
| `layout/items/produce-items.ts:249` | mints `'parent'` or `'leaf'` from `hasChildren` |
| `render/dom/index.ts:206` | maps `parent` to `fg-bar-summary` — a one-row table |
| `render/dom/index.ts:1186` | writes `data-kind` |

**This widens no type.** The alias already ends in `(string & {})`, which accepts any string. Take the two literals out and `string` is what is left.

**What the deletion takes with it.** Core's two built-ins become two ordinary `EntryVariant` objects, registered first. Then:

- **The two structural names stop being special.** They are two names in the same registry as every other variant. There is no reserved list, because nothing can store a name.
- **`BAR_SHAPE_CLASS` goes** (`render/dom/index.ts:205-207`). The summary class comes from the `parent` variant's own `paint`, like every other variant's class.
- **`resolveLook`'s fallback goes** (`produce-items.ts:249`). The `leaf` variant carries no `when`, so it answers for every row no rule claims, and nothing newer is obliged to.

## What ADR 0013 keeps

**Derivation follows children, and this ADR does not touch it.** A variant never changes what an Entry derives. The Rollup is untouched, and a parent that paints as `'milestone'` still rolls up like a parent.

**No `if (variant === …)` chain in core.** Core reads a variant to pick a row out of a registration table — a producer, a paint, a `can`. It never branches on a variant's name. This is the rule that made ADR 0013 worth having, and it is the one this ADR must not spend. Deleting `BAR_SHAPE_CLASS` pays it down further: the one core table keyed by a variant name goes away.

**An Entry carries no stored classification.** The earlier draft of this ADR spent that sentence. This one gives it back.

## A command asks which variant a row resolved to

**The owned-id `Set` answers a fifth question, and the four registrations above do not reach it.** `harness/plugins/buffer-kind.ts:52` is a command's `when`: `({ entry }) => entry !== undefined && owned.has(entry.id)`. The rule above deletes the `Set` that four other lines read. Leave the command as it is and the `Set` survives for one caller; restate the `when` rule inside the command and the harness re-derives what the library just resolved — which is the case `CLAUDE.md`'s stop rule exists to catch.

**So a command context names the variant this Gantt resolved for the Entry it is about.**

```ts
interface CommandContextOf<TGantt, TDataset> {
  entry?: Entry;
  /** The variant this Gantt resolved for `entry`. `undefined` when the invocation names no Entry. */
  variant?: string;
  …
}
```

```ts
ctx.commands.register({
  id: 'demo.bufferKind.markConsumed',
  label: 'Mark buffer consumed',
  when: ({ variant }) => variant === 'buffer', // the rows my variant claimed
  run: …,
});
```

**This is not `entry.variant` under another name, and the refusal at 0017 still holds.** A variant is per Gantt, so a row cannot answer it (I2). A command context **is** one Gantt's, holds that Gantt, and runs off the hot path — so it is the seam that can answer without giving the Dataset a view's opinion.

**One shape was refused: `EntryVariant.commands`.** It would make the name appear once instead of twice, and it costs more. A command has an id, a label, a keybinding and a lifetime of its own, and `when` must also answer for an invocation that names no Entry at all. Two lifetimes under one member is the trap this ADR just spent a whole section removing.

## Consequences

**The word changes at every site, DOM included.** `data-kind` becomes `data-variant`, and the `'look-claimed-twice'` report becomes `'variant-matched-twice'`. Both are published surface — `CONTEXT.md:517` documents the attribute, and `view/gantt-shell.ts:1475` raises the report — so the rename is part of the build, not a tidy-up after it. `fg-bar-summary` keeps its name: it is a CSS class, and it comes from the `parent` variant's own `paint`.

`registerLookClaim`, `registerItemProducer`, `registerLookDefaults` and `RendererByLook` all retire. `KindDefaults` retires with them. `CapabilityInputs` loses `lookOf` and `registeredDefaultsFor` (`view/capability.ts:113-115`).

**Deleting `EntryLook` touches 47 references in 12 files under `src/`**, most of them a type argument on a registration table. The tables retire anyway, so the build deletes the type and its uses in one change.

**Double-claim arbitration stays, and shrinks.** Two rules may both answer yes, so `DoubleLookClaim`, `LookClaimant` and `ReportDoubleClaim` survive. Setup order resolves it and the diagnostic reports it.

**Setup order comes from `requires`, and that was decided on 2026-09-01.** D-S5-31 gives a plugin `requires: readonly PluginId[]`, and the host topologically sorts the installed set before any `setup` runs (`extensions/install-dataset-plugins.ts`). `[a, b]` and `[b, a]` install identically, a missing prerequisite throws `MissingPluginError`, and a ring throws `PluginRequirementCycleError`. **Two plugins with an edge between them are already ordered. Two with no edge are siblings, and a sibling must not depend on load order** (`plans/01` §12). A sibling collision is an authoring error, and the diagnostic exists to name it. [0019](0019-one-plugin-one-install-site.md) gives one plugin one `requires`, so one resolved order serves both halves.

**The newest rule wins — ruled 2026-09-11.** HEAD contradicted itself. `registerClaim` and `register` both say the newest registration wins (`layout/items/produce-items.ts:134-144`). `claimedLookFor` said *"the first yes is the whole answer"* across two different looks (`:197`). **The third one changes, so all three agree.** A fourth seam already votes the same way: `extensions/keymap.test.ts:124` pins *"the handler registered last wins over an earlier command binding."* `requires` argues the same way: `b.requires = ['a']` says b builds on a, so b is the one that should override it. Under first-wins, declaring a dependency made you lose.

**Two things follow, and both are load-bearing.**

- **Core registers its own two variants first**, not last. See *Core registers its own two variants first*. Under the old rule, last meant fallback. Under this one, last would mean core beats every plugin.
- **`claimedVariantFor` walks newest-first and stops at the first yes.** It must not walk oldest-first and keep the last yes: the read runs on every hover change, where the budget is zero allocation and an early exit is the point (`produce-items.ts:182`). Reversing the walk keeps the early exit. A reporter still walks the whole list, because a diagnostic has to see both claimants.

**A variant's `paint` answers before `barRenderer`** (added on acceptance; `J40`). A variant names the rows it covers, so it is the specific answer; `barRenderer` is the catch-all for every bar no variant paints, which is what the retired map's `'*'` entry meant. D-S5-11 still orders that catch-all: a consumer's own `barRenderer` beats a plugin's whole-point `bar` renderer. To take a row a plugin's variant claimed, a consumer declares a variant of the same name, which says *which rows* in one place instead of painting over them. `harness/planner.ts` is the evidence: under the other order it had to restate core's own `parent` rule, with a paint that returned nothing, purely to hold its own `barRenderer` off a row the library already painted.

**[ADR 0015](0015-what-the-write-door-refuses.md) is owed nothing.** The earlier draft added two refusals to the write door — a reserved name, and an unregistered name. Both die with the stored value.

**A variant change is not a `ChangeSet` entry.** The Field write that drives the rule is. That is the same undo, one level down, and it is the consumer's own key.

The docs stop teaching an owned-id `Set`. `harness/plugins/milestone-kind.ts` becomes four lines of page config and no plugin.
