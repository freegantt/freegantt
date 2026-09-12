---
status: proposed — draft, not decision. Opened 2026-09-11, out of a design session on the plugin variant surface. Reworked the same day, after the author ruled that nothing stores a variant. The working material is in `plans/row-redesign/`.
decided: a variant is a rule, and nothing stores one (2026-09-11, author's ruling) — see *Why nothing stores a variant*. `EntryLook` goes away, and a variant name is a `string` (2026-09-11, author's ruling) — see *`EntryLook` goes away*. `when` ships both forms, the field-match shorthand and the predicate (2026-09-11, refuted item 7 in `plans/row-redesign/README.md`). [ADR 0013](0013-what-decides-that-a-row-derives-its-values.md) stands whole: this ADR changes how a variant is registered, and changes nothing about derivation.
open: nothing. **The newest rule wins** (2026-09-11, author's ruling — `Q5`), so all three registration seams agree and core registers its own two variants first. **What sets the order was never open** — `requires` does, ruled 2026-09-01 as D-S5-31, and [0019](0019-one-plugin-one-install-site.md) carries it to a plugin's `view` half. See *Double-claim arbitration*.
---

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

**A variant is a rule. The first registered rule that answers yes wins.** There is no second source and no stored value.

**One variant is one object.** Four registrations become one object, and the name appears once.

```ts
interface EntryVariant {
  name: string; // this variant's identity — the `data-variant` a consumer styles, and the registry key
  when?: VariantRule; // a predicate or a field match; omit it on the last-resort variant
  items?: ItemProducer; // default: one whole-entry Item — the line both examples hand-write
  paint?: BarRenderer;
  can?: Interactions; // per-variant capability, one level under the consumer's own
}
```

An app author installs a variant with no plugin at all:

```ts
new Gantt({
  dataset,
  variants: [{ name: 'milestone', when: { milestone: true }, paint: milestoneBar, can: { resize: false } }],
});
```

A plugin ships the same object through `ctx.addVariant(variant)`. One type, two doors, one shape.

**Core registers its own two variants first**, and they are ordinary `EntryVariant` objects with nothing special about them:

```ts
{ name: 'parent', when: (entry) => entry.hasChildren, paint: summaryBar }
{ name: 'leaf' } // no `when` — it answers for every row, so every row resolves
```

**First, not last — the newest rule wins** (`Q5`, ruled 2026-09-11). Core registers before anything else, so every plugin variant and every consumer variant is newer and overrides it. Core is the floor. A `leaf` variant with no `when` answers for every row, so the floor is total and no row falls through. **Registering core last would make core beat every plugin**, which is the opposite of what its two variants are for.

**A rule reads an `Entry`.** `when` and every `can` predicate receive [0017](0017-the-entry-answers-questions-about-itself.md)'s live row, which is why `!entry.hasChildren && entry.duration()?.value === 0` compiles at all. That is the whole reason 0017 lands first. **Read the duration through `duration()`, not through `read('duration')`.** A `Duration` is `{ value, unit }`, so `read('duration') === 0` compares an object to a number and is always false.

**A variant is a function of the row, and it runs per layout pass** (`layout/items/produce-items.ts:248`). Core caches nothing new. The one input core's own rules read is `hasChildren`, which `#byParent` already caches per commit (`data/entry-store.ts:155-163`). Nothing about a variant can cache on the Dataset, because variants are per Gantt (I2, refuted item 5 in [`plans/row-redesign/README.md`](../../plans/row-redesign/README.md)).

**`name` is an identity, not a value.** It has three jobs, and storage is not one of them. `render/dom/index.ts:1186` stamps it onto the painted element, which `CONTEXT.md:517` publishes as a selector a consumer may style. The registry keys on it. A double-claim diagnostic names it.

**`can` takes the same predicates `interactions` takes.** `KindDefaults` is boolean-only today for one stated reason: _"a registering plugin never sees an `entry`"_ (`view/capability.ts:83-90`). [ADR 0017](0017-the-entry-answers-questions-about-itself.md) hands it one. So the mapped boolean type dies and `Interactions` serves both levels. The resolution order is unchanged: consumer `interactions`, then the variant's `can`, then the library rule. The variant level stays view-level, so refuted item 6 in [`plans/field-redesign/shared/refuted.md`](../../plans/field-redesign/shared/refuted.md) still holds — this is not a second door onto `Field.editable`.

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
- **`resolveLook`'s fallback goes** (`produce-items.ts:249`). The `leaf` variant carries no `when`, so it answers for every row and nothing newer is obliged to.

## What ADR 0013 keeps

**Derivation follows children, and this ADR does not touch it.** A variant never changes what an Entry derives. The Rollup is untouched, and a parent that paints as `'milestone'` still rolls up like a parent.

**No `if (variant === …)` chain in core.** Core reads a variant to pick a row out of a registration table — a producer, a paint, a `can`. It never branches on a variant's name. This is the rule that made ADR 0013 worth having, and it is the one this ADR must not spend. Deleting `BAR_SHAPE_CLASS` pays it down further: the one core table keyed by a variant name goes away.

**An Entry carries no stored classification.** The earlier draft of this ADR spent that sentence. This one gives it back.

## Consequences

**The word changes at every site, DOM included.** `data-kind` becomes `data-variant`, and the `'look-claimed-twice'` report becomes `'variant-claimed-twice'`. Both are published surface — `CONTEXT.md:517` documents the attribute, and `view/gantt-shell.ts:1475` raises the report — so the rename is part of the build, not a tidy-up after it. `fg-bar-summary` keeps its name: it is a CSS class, and it comes from the `parent` variant's own `paint`.

`registerLookClaim`, `registerItemProducer`, `registerLookDefaults` and `RendererByLook` all retire. `KindDefaults` retires with them. `CapabilityInputs` loses `lookOf` and `registeredDefaultsFor` (`view/capability.ts:113-115`).

**Deleting `EntryLook` touches 47 references in 12 files under `src/`**, most of them a type argument on a registration table. The tables retire anyway, so the build deletes the type and its uses in one change.

**Double-claim arbitration stays, and shrinks.** Two rules may both answer yes, so `DoubleLookClaim`, `LookClaimant` and `ReportDoubleClaim` survive. Setup order resolves it and the diagnostic reports it.

**Setup order comes from `requires`, and that was decided on 2026-09-01.** D-S5-31 gives a plugin `requires: readonly PluginId[]`, and the host topologically sorts the installed set before any `setup` runs (`extensions/install-dataset-plugins.ts`). `[a, b]` and `[b, a]` install identically, a missing prerequisite throws `MissingPluginError`, and a ring throws `PluginRequirementCycleError`. **Two plugins with an edge between them are already ordered. Two with no edge are siblings, and a sibling must not depend on load order** (`plans/01` §12). A sibling collision is an authoring error, and the diagnostic exists to name it. [0019](0019-one-plugin-one-install-site.md) gives one plugin one `requires`, so one resolved order serves both halves.

**The newest rule wins — ruled 2026-09-11.** HEAD contradicted itself. `registerClaim` and `register` both say the newest registration wins (`layout/items/produce-items.ts:134-144`). `claimedLookFor` said *"the first yes is the whole answer"* across two different looks (`:197`). **The third one changes, so all three agree.** A fourth seam already votes the same way: `extensions/keymap.test.ts:124` pins *"the handler registered last wins over an earlier command binding."* `requires` argues the same way: `b.requires = ['a']` says b builds on a, so b is the one that should override it. Under first-wins, declaring a dependency made you lose.

**Two things follow, and both are load-bearing.**

- **Core registers its own two variants first**, not last. See *Core registers its own two variants first*. Under the old rule, last meant fallback. Under this one, last would mean core beats every plugin.
- **`claimedVariantFor` walks newest-first and stops at the first yes.** It must not walk oldest-first and keep the last yes: the read runs on every hover change, where the budget is zero allocation and an early exit is the point (`produce-items.ts:182`). Reversing the walk keeps the early exit. A reporter still walks the whole list, because a diagnostic has to see both claimants.

**[ADR 0015](0015-what-the-write-door-refuses.md) is owed nothing.** The earlier draft added two refusals to the write door — a reserved name, and an unregistered name. Both die with the stored value.

**A variant change is not a `ChangeSet` entry.** The Field write that drives the rule is. That is the same undo, one level down, and it is the consumer's own key.

The docs stop teaching an owned-id `Set`. `harness/plugins/milestone-kind.ts` becomes four lines of page config and no plugin.
