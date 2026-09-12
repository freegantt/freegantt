---
status: proposed — draft, not decision. Opened 2026-09-11, out of a design session on the plugin variant surface. Revised the same day, after a review from the field-redesign build raised seven problems (P1–P7). All seven were verified at HEAD before this revision. The working material is in `plans/row-redesign/`.
decided: `Entry` and `StoredEntry` are **two types**, and no derived type reads `keyof` `Entry` (P1, P3). A read seam receives an `Entry`; the edit pipeline carries `StoredEntry` values (P2, P4). The names were ruled on 2026-09-11 — see *The names*. `EntryStoreView.childrenOf` and `EntryStoreView.fieldValue` are deleted — one question, one call site. A removed id carries no flag; existence stays `entries.has(id)`. `entries.fieldValue` retires into `entry.read(key)`. **`FieldContext.durationOf` retires into `entry.duration()`** (2026-09-11, author's ruling), and **`FieldContext.read` retires with it** — see *Three doors*. This closes [#274](https://github.com/Pawel-IT/FreeGantt/issues/274). Any earlier ADR may change where the change buys a cleaner API.
open: two. **`Q2`** — whether the renderer contexts become generic over `TProps`. Build 1 does not close it, and it leaves the six harness casts in place so the evidence stays visible. **`Q7`** — what the Rollup, the ChangeSet and a `compute` Field read a Field with, now that all three are known to hold a row the store does not hold. `Q7` does not reopen the ruling; it decides how to carry it out. Both are in [`plans/row-redesign/BUILD-LOG.md`](../../plans/row-redesign/BUILD-LOG.md). A third question, on the three read doors, was **closed by the author on 2026-09-11**: all three retire.
---

# The Entry answers questions about itself

**This is the first of four ADRs that give one row one object.** [0018](0018-a-variant-is-a-rule-not-an-id-list.md) makes the variant a rule. [0019](0019-one-plugin-one-install-site.md) gives a plugin one install site. [0020](0020-a-plugin-may-own-the-hierarchy.md) lets a plugin say what the tree is. This one comes first, because all three of the others read questions off the row.

## Context

One row has three names, and it lives in three places.

- `Entry` is the stored values. It holds ids, dates, Segments and `props` (`model/entry.ts`).
- Tree shape and Field values are questions on the `Dataset` — `entries.childrenOf(id)`, `entries.fieldValue(id, key)` (`model/dataset.ts`).
- The variant is a registration on the `Gantt` — `registerLookClaim`, `registerItemProducer` (`view/plugin-ports.ts`).

Nothing joins the three. So every seam that needs two of them re-derives the join. **Core does this as often as a plugin does, and so does a consumer.** Seven sites show it, all read at HEAD on 2026-09-11. A line number is a hint — open the file.

| Site                                        | What it does                                                                                                                    | What it shows                                                                                                                                                                                                     |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `harness/planner.ts:70`                     | `const isPhase = dataset.entries.childrenOf(entry.id).length > 0;`                                                              | **The consumer-side site, and the strongest.** A cell renderer holds an `Entry` and must reach back to the Dataset to learn whether its own row has children. A consumer has no private fast path to hide behind. |
| `src/model/field.ts:303,325,333`            | `Aggregator = (children, parent, ctx) => …` (`:333`), and `FieldDistributor` (`:325`) and `RollUpContext.values(children)` (`:303`) take the same pair | `children` is always the children of `parent`. It rides beside `parent` because `parent` cannot answer. This is the surface a consumer writes an Aggregator against.                                              |
| `src/layout/items/produce-items.ts:235,272` | `resolveItems(entry, registry, hasChildren: boolean)`; `produceItemsForRow(…, hasChildren: (id) => boolean)`                    | Read it aloud: "resolve items, entry, registry, has children." A fact about one row, threaded as a positional argument through a call about a frame.                                                              |
| `src/view/capability.ts:92-118`             | `CapabilityInputs` takes five injected functions: `hasChildren`, `descendantsOf`, `fieldFor`, `lookOf`, `registeredDefaultsFor` | Four of the five are questions about one row, and core built them by hand out of side channels. `fieldFor` is the fifth and is not one — it is `dataset.field(key)`, and it stays.                                 |
| `src/view/gantt-shell.ts:1141,1148`         | `dataset.entries.childrenOf(entry.id).length > 0`                                                                               | Core re-derives a boolean the store already holds.                                                                                                                                                                |
| `src/data/entry-store.ts:248`               | `#hasChildren(parent)`, on a fast path the `stagedParents` filter protects                                                      | The boolean exists, is cheap, and is private.                                                                                                                                                                     |
| `src/layout/items/produce-items.ts:60`      | `type LookClaim = (entry: Entry) => boolean`                                                                                    | A claim receives the stored values alone. It cannot ask anything, so both shipped examples claim on an owned-id `Set` instead.                                                                                    |

[#214](https://github.com/Pawel-IT/FreeGantt/issues/214) is the same hole under another name: a `compute` Field cannot depend on the tree, because `FieldContext` cannot reach a second Entry.

## Decision

**A row has two types, and one line divides them.**

- **`StoredEntry`** is the stored values at one point in time. The edit pipeline carries it, and every derived type reads off it.
- **`Entry`** answers questions about the row now. Every read seam receives it.

> **A seam that asks a question about now receives an `Entry`. A seam that describes a change carries `StoredEntry` values.**

The first draft said the `Entry` simply _was_ `Entry`. Four findings killed that, and each one is a real type or a real hot path. They are in _Why `StoredEntry` stays_, below.

### The `Entry`

```ts
interface Entry<TProps> {
  readonly id: EntryId;
  readonly name: string;
  readonly start?: Instant;
  readonly end?: Instant;
  readonly segments: readonly Segment[];

  /** The one by-key value door: a core key, a `props` key, or a `compute` Field. */
  read<K extends FieldKey>(field: K): FieldValue<TProps, K> | undefined;

  /** Core's sixth Field. It computes through `time/`, so it carries parentheses. */
  duration(): Duration | undefined;

  readonly hasChildren: boolean; // free: a cached index read, no allocation
  children(): readonly Entry<TProps>[];
  parent(): Entry<TProps> | undefined;
  descendants(): readonly Entry<TProps>[];
  readonly depth: number;

  /** The loose input shape, and exactly what `entries.add()` takes. */
  toInput(): EntryInput<TProps>;
}
```

The call sites this publishes:

```ts
entry.hasChildren                      // the boolean core and the harness both write by hand today
entry.read('cost')                     // one door, not dataset.entries.fieldValue(id, 'cost')
entry.children().every((c) => …)       // a compute Field may now depend on the tree (#214)
```

### Which seam gets which

| Receives an **`Entry`**                                           | Carries a **`StoredEntry`**                                           |
| ----------------------------------------------------------------- | --------------------------------------------------------------------- |
| the variant rule and the Item producer (`LookClaim`, `ItemProducer`) | `ProposedEdit` / `ProposedEdits`                                      |
| capability resolution and every `Interactions` predicate          | `EditRequest.entries` — the pre-transaction snapshot (D-S5-45)        |
| every renderer context that names an entry                        | `EditRequest.entryAfterEdits(id)` — the post-body state (D-S5-45)     |
| a command's `when` and `run`                                      | `entryAfterEdit` and its five callers (`field-access.ts:242`)         |
| `entries.get`, `entries.all`, the value `entries.add` returns     | a `ChangeSet`'s `{from, to}` values                                   |
|                                                                   | `CoreFieldKey` and `CoreFieldValues`, which derive from `StoredEntry` |
|                                                                   | `EntryInput`, which is what a consumer writes                         |
|                                                                   | `Aggregator`, `FieldDistributor`, `RollUpContext` — corrected 2026-09-11, see below |
|                                                                   | a `compute` Field's `entry` — same reason, and `Q7` owns what it reads with |

**The Rollup reads a row the store does not hold.** The first draft put the Aggregator on the left. It is wrong, and `rollup.ts:262-279` is why: each child there is `effectiveEntry(childId, entries, merged, computed)` — the store, plus this transaction's `merged` edits, plus the values this same bottom-up pass has already computed for that child. `computed` never reaches the store. A live `Entry` answers the store's overlay, so a child read through one loses every value the pass just produced, and bottom-up rollup stops working. `diffEdit` (`change-set.ts:61-72`) reads a second such row — `entryAfterEdit(current, edit)`, a post-edit row no commit has taken. **Both seams stay on stored values, and `Q7` decides what they read a Field with.**

### The names

Ruled 2026-09-11, after the five checks in the naming skill.

**`Entry` names the live one.** The bare word goes to the surface most people read: every variant rule, item producer, Aggregator, capability rule and renderer context. It is what makes the author's own sentence compile — `(entry) => entry.hasChildren`.

**`StoredEntry` names the values.** "Stored" already has exactly one meaning in this codebase — _it has a home in storage_ — in `CLAUDE.md` and in `data/fields/field-access.ts:1-3`'s "storage-shaped edit". It never means "already committed", which matters because `entryAfterEdits(id)` answers with state no commit has taken.

```ts
entries: ReadonlyMap<EntryId, StoredEntry>;
entryAfterEdits(id: EntryId): StoredEntry | undefined;
type CoreFieldKey = keyof Omit<StoredEntry, 'id' | 'props'>;
```

That last line is why the name earns its place. `CoreFieldKey` **is** the question "which keys does storage own", and P1 below is that question silently harvesting live members instead.

Three names lost. `EntrySnapshot` fails check 4: `CONTEXT.md:23` gives "Snapshot" to the committed, cached array `all` returns. `EntryRecord` fails check 1: `CONTEXT.md:37` lists "record" and "row" under _Avoid_ for this concept, which is why this ADR says _stored values_ and never _record_. `EntryHandle` fails check 4: `CONTEXT.md:127` gives "handle" to a held event registration.

`CONTEXT.md` keeps **one** Entry entry. `StoredEntry` is named inside it, as what an Entry's stored values are called — not as a second concept.

### Five rules

1. **`model/` declares both types. `data/` builds the `Entry`.** The interfaces are types, so `model/` keeps zero runtime (`plans/01` §1.1). The factory sits beside the store and the indexes it reads.
2. **One `Entry` per id, and every read is live.** The `Entry` allocates nothing per frame and keeps a stable identity inside a `Set`. **Live means what `childrenOf` answers today**: the committed index, overlaid with the open write set (`entry-store.ts:214-218`). It does not mean `all`, which is committed-only (D-S2-21, `:167`).
3. **No derived type reads `keyof` the `Entry`.** `CoreFieldKey`, `CoreFieldValues` and `ProposedEdit` all derive from `StoredEntry`, and they stay that way.
4. **A member that does no work is a property. A member that computes, walks or allocates carries parentheses.** `id`, `name`, `start`, `end`, `segments` and `depth` are properties — each one hands back what the row already holds. `hasChildren` is a property too: it reads the cached `#byParent` index and answers a boolean, so it allocates nothing. `children()`, `parent()`, `descendants()` and `duration()` carry parentheses, because each one computes, walks or allocates.

   **This rule was stated wrongly in the first draft**, as *"a getter answers one value; anything that returns a collection is a method."* Its own interface breaks that twice: `parent()` answers one value and carries parentheses, and `segments` is a collection and is a property. The principle was always the cost, never the arity. Corrected 2026-09-11, on the author's question about `duration`.
5. **`read()` is the one value door**, so `entry.props` leaves the read surface. A withdrawn draft picked `read` as the name first, for a by-key door beside `fieldValue` ([the gap at 0014](README.md#the-gap-at-0014)). **That draft was withdrawn for a good reason, and this ADR is not a revival of it.** It kept the read on the collection, so `read` would have been a second by-key door and the caller would still name an id it already holds. This ADR puts the read on the object that holds the value. `entry.read('cost')` reads true in English, and one surface publishes it, not two.

   **Three doors retire, and all three are decided** (2026-09-11, author's ruling). `entries.fieldValue(id, key)`, `FieldContext.read(entry, key)` and `FieldContext.durationOf(entry)` all answer "what is this Field worth on this row". All three retire into `entry.read(key)` and `entry.duration()`. **What replaces the last two on the three seams that read a row the store does not hold is open — see `Q7`.**

   | Door at HEAD | Where | Fate |
   | --- | --- | --- |
   | `entries.fieldValue(id, key)` | `model/dataset.ts:28` — 77 refs in 14 files | **deleted — decided** |
   | `FieldContext.read(entry, key)` | `model/field.ts:283`, `data/fields/field-access.ts:126` — 11 `ctx.read` call sites, plus 3 declaration and implementation sites | **deleted — ruled 2026-09-11** |
   | `FieldContext.durationOf(entry)` | `model/field.ts:286`, `data/fields/field-access.ts:133` — 13 refs in 9 files | **deleted — ruled 2026-09-11** |

**The `Entry` reads. The store writes.** There is no `entry.update()`. `dataset.entries.update(id, edit)` stays the one write door, and [ADR 0015](0015-what-the-write-door-refuses.md) keeps everything it decided.

**Every core Field reaches the row once.** Core declares six Fields (`data/fields/core-fields.ts:65-105`), and the live `Entry` gives each one a member:

| Core Field | On the `Entry` |
|---|---|
| `name`, `start`, `end`, `segments` | the property of the same name |
| `parentId` | `parent()` — one fact, one surface |
| `duration` | `duration()` |

**`duration` was the only core Field with no member**, and `entry.read('duration')` was standing in for one. That is a stringly-typed call for a value core itself declares, beside `entry.start` and `entry.end`, which are the two values it is computed from. Ruled 2026-09-11, on the author's question.

`read(key)` still answers `'duration'`, exactly as it answers `'start'`. A core Field has both doors: the typed member, and the by-key door a generic caller needs. A consumer Field has only the by-key door, because core cannot declare a member for a key it has never seen.

**The `Entry` answers data questions only.** The variant is per Gantt, because two Gantts on one Dataset may install different variants. So `entry.variant` is not on the `Entry`. See [0018](0018-a-variant-is-a-rule-not-an-id-list.md).

**`StoredEntry` publishes `parentId`. The `Entry` publishes `parent()`.** One fact reaches each surface once. `EntryInput.parentId` stays, because it is input.

## Why `StoredEntry` stays

Four findings, each verified at HEAD on 2026-09-11. Any one of them alone decides the two-type split.

**P1 — the core Field key list derives from `StoredEntry`.** `model/field.ts:12` is `export type CoreFieldKey = keyof Omit<Entry, 'id' | 'props'>;`, and `:21` builds `CoreFieldValues` the same way. Put seven `Entry` members on the type those read, and all seven become core Field keys. `gantt.gridColumns = ['children']` would then typecheck, and `isCoreFieldKey` (`data/fields/core-fields.ts:115`) would answer false at runtime and throw `UnknownFieldError` on a key the compiler just offered.

**P3 — so does the edit shape.** `model/entry.ts:179` is `& Partial<Omit<Entry, 'id' | 'start' | 'end' | 'props'>>`. Every `Entry` member would join `ProposedEdit` as an optional member, and a plugin author reads `ProposedEdit` off `EditRequest.proposed`.

**P2 — core spreads `StoredEntry` on its hot path.** `data/fields/field-access.ts:242` is `const next: Entry = { ...entry };`, and `:257` then assigns `next.props`. Five callers reach it (`entry-store.ts:180`, `entry-tree.ts:17,36,53`, `rollup.ts:198`, `change-set.ts:61`). A spread copies own enumerable properties only. An `Entry` would lose its methods there and still typecheck, and the assignment would refuse against a getter in strict mode. Under this ADR nothing changes at that line: it takes a `StoredEntry` and returns one.

**P4 — two `Entry` positions are deliberately different.** `model/entry.ts:204` documents `EditRequest.entries` as the state _before_ this transaction's edits. `:216` documents `entryAfterEdits(id)` as the state _after_ its body. D-S5-45 is why both exist. A live `Entry` answers one question, so it would collapse the pair and hand every cascade a delta of zero. Both stay stored values.

## The seam with `layout/`

**The `Entry` must not couple `layout/` to `data/`** (the author's constraint, 2026-09-11). It does not, and one existing rule proves it.

- **`model/` declares the interface.** It is a type, so `model/` keeps zero runtime.
- **`data/` builds it**, beside the store and the indexes it reads.
- **`layout/` names the type and never the factory.** `.dependency-cruiser.cjs:63` already forbids everything but `time` and `model` to `layout/`. That rule does not change, and it is what holds the seam.

So the import graph is the one that ships today — `layout/ → model/`. What changes is the member list on a type `layout/` already imports.

**One hazard is real.** An `Entry` lets a layout pass pull from the store lazily, and a per-row `descendants()` call inside a frame would walk the tree once per row. Rule 4 is the guard.

## Consequences

**Core stops re-deriving.** Three of `CapabilityInputs`' five injected functions collapse to the `entry` argument — `hasChildren` and `descendantsOf` here, `lookOf` in [0018](0018-a-variant-is-a-rule-not-an-id-list.md). **`fieldFor` stays.** It is `dataset.field(key)`, a Field-registry lookup (`view/capability.ts:202`), and a row holds no registry — it is not a question about the row at all. `gantt-shell.ts:1141` and `:1148` go, and `:1142` loses its inner `childrenOf` with `descendantsOf`. `resolveItems`' positional `hasChildren` goes. **`#hasChildren` stays private**: `layout/` may not import `data/`, so nothing outside the store gains a caller, and a public one would be a second door onto `entry.hasChildren`.

**The Aggregator surface loses an argument, and keeps its own child list.** `Aggregator = (parent, ctx) => …` and `FieldDistributor = (value, parent, ctx) => …`. The `children` argument does not become `parent.children()`: the paragraph above says why that answers the wrong state. It moves onto the context, bound to the list the Rollup built — `ctx.children`, with `ctx.values()` and `ctx.numericValues()` reading it and taking no argument. The gain the evidence table asked for is the same: one list, passed once, never beside a `parent` that cannot answer for it. **`RollUpContext` keeps its own reads.** `rollup.ts:23-26` holds two edit sets for two questions — `body` and `merged` — and [refuted item 8 in `field-redesign/shared/refuted.md`](../../plans/field-redesign/shared/refuted.md) records that the split is deliberate. Do not delete `ctx.values()` on the strength of this paragraph.

**The public surface gets smaller, not larger.** `EntryStoreView.childrenOf` and `EntryStoreView.fieldValue` become `Entry` members. The cost is `entries.get(id)?.children() ?? []` where a call site used `childrenOf(id)`. **Ruled 2026-09-11: they go.**

**P7 — this ADR deletes `fieldValue`, which is what HEAD ships** (`model/dataset.ts:28`). The only other ADR that proposed to rename this door was withdrawn on 2026-09-11 and deleted ([the gap at 0014](README.md#the-gap-at-0014)), so nothing else renames it and no build has to coordinate with one. This ADR owns the change outright: 77 references in 14 files, and one rename happens, not two.

**A removed id carries no flag.** An `Entry` outlives its `StoredEntry` and keeps the last values it read. Existence has one door already — `entries.has(id)`, and `entries.get(id)` answering `undefined`. A `removed` boolean would be a second door onto the same fact, and it would invite an `if (entry.removed)` branch at every reader. Nothing in core needs one: the edit pipeline carries `StoredEntry` values, so undo and replay never meet an `Entry`.

**[#214](https://github.com/Pawel-IT/FreeGantt/issues/214) closes when `Q7` answers.** A `compute` Field walks its own children, which is what #214 asks for. Whether it reaches them off an `Entry` argument or off its context depends on what `Q7` decides, because `readField` calls a `compute` with rows the store does not hold.

**Three sites outside the store stop reading `.parentId` here, and a fourth waits for [0020](0020-a-plugin-may-own-the-hierarchy.md).** `layout/rows/entries-source.ts:16`, `layout/frame-memory.ts:77` and `view/tree-collapse.ts:111,153` each ask what the tree is by reading the stored field. They ask `entry.parent()`, `entry.children()` or `entry.hasChildren` instead. **`data/rollup.ts:46,52` does not move with them.** `collectTouchedIds` reads the `entries` map it was handed — stored values, not the store's now — to find the *former* parent of a moved row, and `:51`'s `'parentId' in edit` asks what the edit **wrote**, which is a write-shape check on `ProposedEdit` and stays either way. Ask a live `parent()` there and the pass misses the former parent and skips a Rollup after a move. That invalidation belongs with the hierarchy source, so 0020 takes it. This is the part of the work [0020](0020-a-plugin-may-own-the-hierarchy.md) cannot land without: a site left reading the field disagrees with the library the moment a plugin owns the hierarchy. `data/entry-reader.ts:229,567` name `parentId` too, but those two **write** the stored value and stay as they are.

**`spansTime(entry)` stays a free function.** It narrows the type, and a getter cannot. It reads `start` and `end` only, so it serves both types.

## Why the three doors go — ruled 2026-09-11

**Both doors leave the public surface. Three callers cannot reach a live `Entry`, and `Q7` owns them.** Verified at HEAD, and the first draft of this table claimed all five could.

| Caller | Today | After |
|---|---|---|
| `extensions/features/inline-editing.ts:109-126` | hand-builds a whole `FieldContext` | **the function goes** — it reads the store's now, through `entries.fieldValue` |
| `data/fields/core-fields.ts:106` — the duration Field's own `compute` | `compute: (entry, ctx) => ctx.durationOf(entry)` | **`Q7`** — `readField` calls a `compute` with a post-edit row (`change-set.ts:61`) and with an effective child (`rollup.ts:262`). Neither is a live `Entry`. |
| `data/fields/aggregators.ts:14,51` — `weightedMeanByDuration` | `ctx.durationOf(entry)`, `ctx.read(child, ctx.field)` | **`Q7`** — its children are effective rows, `computed` values included |
| `data/change-set.ts:72` | `ctx.read(current, key)` **and `ctx.read(next, key)` in the same expression** | **`Q7`** — `next = entryAfterEdit(current, edit)` is a row no commit has taken and the store cannot answer for |

**The first row is why this is worth doing, and it is not blocked.** `fieldContextFor()` exists only because a `parseValue` needs a `FieldContext` and `extensions/` cannot reach `data/`. Its two members are `read` and `durationOf`, and both read the store's now. Put both on the row, and there is nothing left to build. That deletes the shim, the wrong `'day'` unit, and the `'day'`-into-`MS.DAY` bug below.

**The other three read a row the store does not hold**, so `entry.read(key)` cannot serve them and the ruling needs one more answer to be implementable. It is `Q7`, and it does not reopen the ruling: the two doors leave the public surface either way.

**One condition on `duration()`.** It computes from `start` and `end` through `time/`. It must not route through `read('duration')` and the Field registry, or the circle has only moved. The Field declaration delegates **to** the computation, never the reverse — and `Q7` decides whether it reaches it through the row or through the context, because `readField` hands a `compute` a row the store does not hold.

**This closes [#274](https://github.com/Pawel-IT/FreeGantt/issues/274), including the half nobody was tracking.** The issue says `Duration.unit` is never read, and that is literally true:

- `formatDuration` (`core-fields.ts:52`) computes `duration.value / MS.DAY`. It assumes millisecond and never checks `unit`.
- `compareDuration` (`:59`) computes `a.value - b.value`. It compares raw numbers across units.
- `inline-editing.ts:118` produces `unit: 'day'`.

A `'day'` duration reaching `formatDuration` divides days by 86,400,000. **One producer with one unit makes both functions correct by construction**, instead of correct by luck.

**One stale comment goes with the shim.** `inline-editing.ts:110-111` says a segmented Entry's true duration is *"`layout/`'s own `durationOf`, which `extensions/` cannot reach."* **There is no `durationOf` in `layout/`.** Duration is `end - start` everywhere, gaps included.

## Open

**`Q7` — what reads a Field off a row the store does not hold?** Three seams hold one: the Rollup's effective children (`rollup.ts:262`), the ChangeSet's post-edit row (`change-set.ts:61`), and every `compute` Field, which both of those call. `entry.read(key)` answers for the row **now**, so it serves none of them. The ruling stands — both doors leave the public surface — and what remains is which shape replaces them. `plans/row-redesign/BUILD-LOG.md` carries the question and a recommendation. **Build 1 cannot finish Unit D without an answer.**

**Does a segmented Entry's duration count the gaps? Ruled 2026-09-11: the consumer chooses.** Core answers the span today (`end - start`, gaps counted), and that stays the default. A `duration: 'span' | 'segments'` option on the `Dataset` lets a consumer ask for the sum of the Segments instead, and `entry.duration()` reads it. The option sits on the `Dataset`, not the `Gantt`: duration is a Field, the Rollup reads it before any Gantt exists, and a view may not change what a value **is**. **Only the config key's name is still open.**

**`TProps` at the renderer seams.** `ColumnCellRendererContext.entry?: Entry` and `fieldValue: unknown` carry no `TProps` today (`model/field.ts:67,73`), which is why `harness/planner.ts:69,85,174` all cast. A typed `entry.read('cost')` needs a `TProps` the `Entry` carries through those same seams. The casts sit in the harness, so under `CLAUDE.md`'s stop rule they are evidence of an API gap, not a harness problem. This ADR should close it rather than inherit it.

**What the gap costs today, measured 2026-09-11.** `harness/planner.ts` pays it six times: `entry.props as PlannerEntryProps` at `:69`, `:85` and `:174`, and `fieldValue as Instant` at `:104`, `:114` and `:116`. Every one is a consumer restating a type the library already knows.

**The shape of the answer, if the author takes it.** `Entry<TProps>` already carries `TProps`, so the work is to thread it through the two renderer contexts that name an entry — `ColumnCellRendererContext` and the Gantt-wide `CellRendererContext` — and to type `read<K>` off it. `fieldValue: unknown` then goes: `entry.read(key)` answers `FieldValue<TProps, K> | undefined` and the six casts go with it.

**Why it is still open.** `model/field.ts` declares `ColumnCellRendererContext` and `model/` may not import `layout/` (`model-is-leaf`). A generic on a `model/` type is free, but every seam that builds one of these contexts has to pass the argument, and `layout/renderer.ts` builds the Gantt-wide one. That is a reach across three layers on a hot path, and it earns its own decision rather than a paragraph here. **Build 1 does not close it. Build 1 files it as a `Q` entry and leaves the six casts in place**, so the evidence stays visible.
