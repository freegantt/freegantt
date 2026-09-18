---
status: accepted — built and gated on `row-redesign`, 2026-09-12. The gate's verdict line: `verify:full PASS — all 16 checks green, test:e2e included (70s)`. Opened 2026-09-11, out of a design session on the plugin variant surface. Revised the same day, after a review from the field-redesign build raised seven problems (P1–P7). All seven were verified at HEAD before this revision. The working material is in `plans/row-redesign/`.
decided: `Entry` and `StoredEntry` are **two types**, and no derived type reads `keyof` `Entry` (P1, P3). A read seam receives an `Entry`; the edit pipeline carries `StoredEntry` values (P2, P4). The names were ruled on 2026-09-11 — see *The names*. `EntryStoreView.childrenOf` and `EntryStoreView.fieldValue` are deleted — one question, one call site. A removed id carries no flag; existence stays `entries.has(id)`. `entries.fieldValue` retires into `entry.read(key)`. **`FieldContext.durationOf` retires into `entry.duration()`** (2026-09-11, author's ruling), and **`FieldContext.read` retires with it** — see *Three doors*. Both lose their `entry` argument and leave the *row* surface; a pass keeps the same two questions, bound to the row it is computing — `ComputeContext.read(key)` and `ComputeContext.duration()` (2026-09-11, review fix; see *What a hypothetical row reads with*). This closes [#274](https://github.com/Pawel-IT/FreeGantt/issues/274). Any earlier ADR may change where the change buys a cleaner API.
open: nothing this redesign answers. **`Q2`** — whether the renderer contexts become generic over `TProps` — is **deferred to [#284](https://github.com/Pawel-IT/FreeGantt/issues/284)** and settles after Build 4 (2026-09-11, author's ruling). Build 1 leaves the three `fieldValue` casts in place so the evidence stays visible. Two questions closed on 2026-09-11. The three read doors all retire (`Q1`). The Rollup, the ChangeSet and a `compute` Field hold a row the store does not hold, so they carry `StoredEntry` values and read the tree through **`ctx.children()`** (`Q7`) — see *What a hypothetical row reads with*. Every `Q` is in [`plans/row-redesign/BUILD-LOG.md`](../../plans/row-redesign/BUILD-LOG.md).
---

> **Superseded in two statements by [ADR 0024](0024-parentid-answers-the-stored-value-on-every-door.md)**, ruled and built 2026-09-13 (#331). *A live row answers one tree*'s table row `parentId` → `parent()` (below) and its sentence "`entry.read('parentId')` answers `parent()?.id`" no longer hold, and neither does *one row, one tree, whichever door you ask through*: `read('parentId')` now answers the stored value, like every other key, on every door. The tree kept its own by-key door — `hierarchyParentId`, a new core Field — rather than `parentId` continuing to answer two different questions depending which door asked. **Do not rewrite the body.** Everything else in this ADR stands, `read()` as the one by-key value door included.

> **Vocabulary note, added 2026-09-17 ([#421](https://github.com/Pawel-IT/FreeGantt/issues/421)).** This record predates the `Item`→`Bar` rename ([ADR 0026](0026-the-segment-retires.md)). Read every `Item` below as `Bar`. **Do not rewrite the body.**

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
interface Entry<TProps = Record<string, unknown>> {
  readonly id: EntryId;
  readonly name: string;
  readonly start?: Instant;
  readonly end?: Instant;
  readonly segments: readonly Segment[];

  /** The one by-key value door: a core key, a `props` key, or a `compute` Field. Every answer is
   *  live, `'parentId'` included — see *A live row answers one tree*. */
  read<K extends FieldKey>(field: K): FieldValue<TProps, K> | undefined;

  /** Core's sixth Field. It computes through `time/`, so it carries parentheses. */
  duration(): Duration | undefined;

  readonly hasChildren: boolean; // free: a cached index read, no allocation
  children(): readonly Entry<TProps>[];
  parent(): Entry<TProps> | undefined;
  descendants(): readonly Entry<TProps>[];
  readonly depth: number;

  /** The loose input shape, and exactly what `entries.add()` takes. It is how a row is copied. */
  toInput(): EntryInput<TProps>;
}
```

The call sites this publishes:

```ts
entry.hasChildren                      // the boolean core and the harness both write by hand today
entry.read('cost')                     // one door, not dataset.entries.fieldValue(id, 'cost')
entry.children().every((c) => …)       // a rule may now ask about the tree (#214)
entries.add({ ...entry.toInput(), id: 'copy-1' })   // duplicate this row
```

**`toInput()` earns its place on that last line, and that is the whole of its job.** A copy needs the values a copy stores — `props` included — and `read()` answers a Field, not the input shape. So the one member that hands back stored values names what it is for: input. It is not a second read door, and nothing in a renderer, a rule or a capability calls it.

### Which seam gets which

| Receives an **`Entry`**                                           | Carries a **`StoredEntry`**                                           |
| ----------------------------------------------------------------- | --------------------------------------------------------------------- |
| the variant rule and the Item producer (`LookClaim`, `ItemProducer`) | `ProposedEdit` / `ProposedEdits`                                      |
| capability resolution and every `Interactions` predicate          | `EditRequest.entries` — the pre-transaction snapshot (D-S5-45)        |
| every renderer context that names an entry                        | `EditRequest.entryAfterEdits(id)` — the post-body state (D-S5-45)     |
| a command's `when` and `run`                                      | `entryAfterEdit` and its five callers (`field-access.ts:242`)         |
| `entries.get`, `entries.all`, the value `entries.add` returns — **`all` hands back live rows, and which rows it hands back is still committed-only** (rule 2) | a `ChangeSet`'s `{from, to}` values                                   |
|                                                                   | `CoreFieldKey` and `CoreFieldValues`, which derive from `StoredEntry` |
|                                                                   | `EntryInput`, which is what a consumer writes                         |
|                                                                   | `Aggregator`, `FieldDistributor`, `RollUpContext` — corrected 2026-09-11, see below |
|                                                                   | a `compute` Field's `entry` — same reason. It asks the pass for the rest: `ctx.read(key)`, `ctx.duration()`, `ctx.children()` |

**The Rollup reads a row the store does not hold.** The first draft put the Aggregator on the left. It is wrong, and `rollup.ts:262-279` is why: each child there is `effectiveEntry(childId, entries, merged, computed)` — the store, plus this transaction's `merged` edits, plus the values this same bottom-up pass has already computed for that child. `computed` never reaches the store. A live `Entry` answers the store's overlay, so a child read through one loses every value the pass just produced, and bottom-up rollup stops working. `diffEdit` (`change-set.ts:61-72`) reads a second such row — `entryAfterEdit(current, edit)`, a post-edit row no commit has taken. **Both seams stay on stored values, and both read the tree through `ctx.children()`.**

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

   **Two questions hide in one word, and `all` answers them differently.** *Which* rows exist is the collection's question, and `all` answers it as of the last commit — the array is a `computed` bound to `#revision`, and `ScaleBinding`'s reference comparison rests on that (D-S1.5-4, `entry-store.ts:150-153`). *What a row is worth* is the row's question, and every `Entry` answers it now. So inside an open transaction `all` does not grow, and each row in it already reads the write set. `has`, `get` and `size` are the live membership doors, and all three follow the write set today — `all.length` never did.

   **A review asked for `all: readonly StoredEntry[]` instead, and it is refused.** It reads as the cleaner snapshot, and it costs the thing this ADR is for: `layout/` receives that array (`gantt-shell.ts:725`), and `entries-source.ts:55` then rebuilds the whole tree out of `parentId` because stored values are all it holds. That is the re-derivation [0020](0020-a-plugin-may-own-the-hierarchy.md) cannot survive. The stored values stay reachable where they are needed and nowhere else: `entry.toInput()` copies a row, and the edit pipeline carries `StoredEntry` already. **`entries.storedValues` is the third door, added during the build** (`J20`): the committed rows as a `ReadonlyMap<EntryId, StoredEntry>`, the store's own index handed out read-only. It is not this refusal reopened — the refused shape was the row *list* `layout/` receives, which must stay live or `entries-source.ts` rebuilds the tree out of `parentId`. `storedValues` answers one question (`EditRequest.entries`, committed-only by D-S5-45) and `layout/` never calls it.
3. **No derived type reads `keyof` the `Entry`.** `CoreFieldKey`, `CoreFieldValues` and `ProposedEdit` all derive from `StoredEntry`, and they stay that way.
4. **A member that does no work is a property. A member that computes, walks or allocates carries parentheses.** `id`, `name`, `start`, `end`, `segments` and `depth` are properties — each one hands back what the row already holds. `hasChildren` is a property too: it reads the cached `#byParent` index and answers a boolean, so it allocates nothing. `children()`, `parent()`, `descendants()` and `duration()` carry parentheses, because each one computes, walks or allocates.

   **This rule was stated wrongly in the first draft**, as *"a getter answers one value; anything that returns a collection is a method."* Its own interface breaks that twice: `parent()` answers one value and carries parentheses, and `segments` is a collection and is a property. The principle was always the cost, never the arity. Corrected 2026-09-11, on the author's question about `duration`.
5. **`read()` is the one value door**, so `entry.props` leaves the read surface. A withdrawn draft picked `read` as the name first, for a by-key door beside `fieldValue` ([the gap at 0014](README.md#the-gap-at-0014)). **That draft was withdrawn for a good reason, and this ADR is not a revival of it.** It kept the read on the collection, so `read` would have been a second by-key door and the caller would still name an id it already holds. This ADR puts the read on the object that holds the value. `entry.read('cost')` reads true in English, and one surface publishes it, not two.

   **Three doors retire, and all three are decided** (2026-09-11, author's ruling). `entries.fieldValue(id, key)`, `FieldContext.read(entry, key)` and `FieldContext.durationOf(entry)` all answer "what is this Field worth on this row". All three retire into `entry.read(key)` and `entry.duration()`. **Three seams read a row the store does not hold, and they read the tree through `ctx.children()` instead** — see *What a hypothetical row reads with*.

   | Door at HEAD | Where | Fate |
   | --- | --- | --- |
   | `entries.fieldValue(id, key)` | `model/dataset.ts:28` — 77 refs in 14 files | **deleted — decided** |
   | `FieldContext.read(entry, key)` | `model/field.ts:283`, `data/fields/field-access.ts:126` — 11 `ctx.read` call sites, plus 3 declaration and implementation sites | **the `entry` argument goes — ruled 2026-09-11.** The question moves onto the pass as `ComputeContext.read(key)` |
   | `FieldContext.durationOf(entry)` | `model/field.ts:286`, `data/fields/field-access.ts:133` — 13 refs in 9 files | **the `entry` argument goes — ruled 2026-09-11.** The question moves onto the pass as `ComputeContext.duration()` |

   **Neither door survives on a row a caller names.** That is what "retire" means here, and it is what makes `entry.read(key)` the one by-key door on a row. A pass is not a row: it is computing exactly one, so it asks with no argument at all.

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

### A live row answers one tree

**`StoredEntry` publishes `parentId`. The `Entry` publishes `parent()`.** One fact reaches each surface once. `EntryInput.parentId` stays, because it is input.

**`entry.read('parentId')` answers `parent()?.id`** — ruled 2026-09-11, on a review finding. `parentId` is a core Field, so `read` must answer it: `read` is *the* by-key door, and a Grid column on `parentId` goes through it like every other column. A live row that answered the stored field there would disagree with its own `parent()` the moment [0020](0020-a-plugin-may-own-the-hierarchy.md) lands, and a WBS column would print a stale id beside live indentation. **One row, one tree, whichever door you ask through.**

The write side does not move: `update(id, { parentId })` writes the stored field, and `StoredEntry.parentId` is what it wrote. Under a plugin-owned hierarchy those two may differ, and that is the plugin taking the tree over on purpose ([0020](0020-a-plugin-may-own-the-hierarchy.md), *What core keeps*).

**Prefer `parent()` anyway.** It answers with the row, not with an id, so the next call is a read and not a lookup. `read('parentId')` exists for the generic caller — a column, a serializer, a `values()` fold — that holds a key and not a member name.

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

**The Aggregator surface loses an argument, and keeps its own child list.** `Aggregator = (parent, ctx) => …` and `FieldDistributor = (value, parent, ctx) => …`. The `children` argument does not become `parent.children()`: the paragraph above says why that answers the wrong state. It moves onto the context, bound to the list the Rollup built — `ctx.children()`, with `ctx.values(key?)` and `ctx.numericValues(key?)` reading it and taking no child list (the key defaults to `ctx.field`). The gain the evidence table asked for is the same: one list, passed once, never beside a `parent` that cannot answer for it. **`RollUpContext` keeps its own reads.** `rollup.ts:23-26` holds two edit sets for two questions — `body` and `merged` — and [refuted item 8 in `field-redesign/shared/refuted.md`](../../plans/field-redesign/shared/refuted.md) records that the split is deliberate. Do not delete `ctx.values()` on the strength of this paragraph.

**The public surface gets smaller, not larger.** `EntryStoreView.childrenOf` and `EntryStoreView.fieldValue` become `Entry` members. The cost is `entries.get(id)?.children() ?? []` where a call site used `childrenOf(id)`. **Ruled 2026-09-11: they go.**

**P7 — this ADR deletes `fieldValue`, which is what HEAD ships** (`model/dataset.ts:28`). The only other ADR that proposed to rename this door was withdrawn on 2026-09-11 and deleted ([the gap at 0014](README.md#the-gap-at-0014)), so nothing else renames it and no build has to coordinate with one. This ADR owns the change outright: 77 references in 14 files, and one rename happens, not two.

**A removed id carries no flag.** An `Entry` outlives its `StoredEntry` and keeps the last values it read. Existence has one door already — `entries.has(id)`, and `entries.get(id)` answering `undefined`. A `removed` boolean would be a second door onto the same fact, and it would invite an `if (entry.removed)` branch at every reader. Nothing in core needs one: the edit pipeline carries `StoredEntry` values, so undo and replay never meet an `Entry`.

**[#214](https://github.com/Pawel-IT/FreeGantt/issues/214) closes.** A `compute` Field walks its own children through `ctx.children()`. It reads them off the context and not off its `entry` argument, because `readField` calls a `compute` with rows the store does not hold.

**Three sites outside the store stop reading `.parentId` here, and a fourth waits for [0020](0020-a-plugin-may-own-the-hierarchy.md).** `layout/rows/entries-source.ts:16`, `layout/frame-memory.ts:77` and `view/tree-collapse.ts:111,153` each ask what the tree is by reading the stored field. They ask `entry.parent()`, `entry.children()` or `entry.hasChildren` instead. **`data/rollup.ts:46,52` does not move with them.** `collectTouchedIds` reads the `entries` map it was handed — stored values, not the store's now — to find the *former* parent of a moved row, and `:51` asked what the edit **wrote**, through a `'parentId' in edit` check. **That check is gone** (`J53`, [0020](0020-a-plugin-may-own-the-hierarchy.md)): a plugin source may answer out of a `props` key, so a row can move with no `parentId` write to spot. `collectTouchedIds` now asks the source for every edit instead. Ask a live `parent()` there and the pass misses the former parent and skips a Rollup after a move. That invalidation belongs with the hierarchy source, so 0020 takes it. This is the part of the work [0020](0020-a-plugin-may-own-the-hierarchy.md) cannot land without: a site left reading the field disagrees with the library the moment a plugin owns the hierarchy. `data/entry-reader.ts:229,567` name `parentId` too, but those two **write** the stored value and stay as they are.

**`spansTime(entry)` stays a free function.** It narrows the type, and a getter cannot. It reads `start` and `end` only, so it serves both types.

## Why the three doors go — ruled 2026-09-11

**Both doors leave the public surface. One caller reaches a live `Entry`, and three cannot.** Verified at HEAD, and the first draft of this table claimed all five could.

| Caller | Today | After |
|---|---|---|
| `extensions/features/inline-editing.ts:109-126` | hand-builds a whole `FieldContext` | **the function goes** — it reads the store's now, through `entries.fieldValue` |
| `data/fields/core-fields.ts:106` — the duration Field's own `compute` | `compute: (entry, ctx) => ctx.durationOf(entry)` | computes from `entry.start` and `entry.end` through `time/`, which is what `field-access.ts:133` does today. `readField` calls a `compute` with a post-edit row (`change-set.ts:61`) and with an effective child (`rollup.ts:262`), so neither argument is a live `Entry`. |
| `data/fields/aggregators.ts:14,51` — `weightedMeanByDuration` | `ctx.durationOf(entry)`, `ctx.read(child, ctx.field)` | `ctx.values()` beside `ctx.durations()`. Its children are effective rows, `computed` values included. |
| `data/change-set.ts:72` | `ctx.read(current, key)` **and `ctx.read(next, key)` in the same expression** | `readField` directly. `diffEdit` sits in `data/`, and `next = entryAfterEdit(current, edit)` is a row no commit has taken. |

**The first row is why this is worth doing, and it is not blocked.** `fieldContextFor()` exists only because a `parseValue` needs a `FieldContext` and `extensions/` cannot reach `data/`. Its two members are `read` and `durationOf`, and both read the store's now. Put both on the row, hand `parseValue` that row, and there is nothing left to build — `FieldContext` is `{ timeZone }`, and `dataset.timeZone` is public. That deletes the shim, the wrong `'day'` unit, and the `'day'`-into-`MS.DAY` bug below.

**The other three read a row the store does not hold**, so `entry.read(key)` cannot serve them. The next section is what they read with. It was ruled on 2026-09-11, and it does not reopen this one: both doors leave the public surface either way.

## What a hypothetical row reads with — ruled 2026-09-11

**The read binds to the pass, and the pass carries its own row.** Every question a `compute` Field or an Aggregator asks is about the one row it is computing, so nothing on the context takes an entry argument.

```ts
/** Ambient. One per Dataset, reused by every read. */
interface FieldContext {
  readonly timeZone: string;
}

/** What a `compute` Field runs inside. Built per pass, bound to the row being computed. */
interface ComputeContext extends FieldContext {
  /** Another Field on this same row — a core key, `duration`, or another Field's `compute`. */
  read<K extends FieldKey>(key: K): CoreFieldValue<K> | undefined;
  /** This row's duration, through `time/` and the Dataset's `measureDuration`. */
  duration(): Duration | undefined;
  /** The children of the row this pass is computing. It walks, so it carries parentheses. */
  children(): readonly StoredEntry[];
}

interface RollUpContext extends ComputeContext {
  readonly field: FieldKey;
  values(key?: FieldKey): readonly unknown[]; // `ctx.field` by default
  numericValues(key?: FieldKey): readonly number[];
  durations(): readonly (Duration | undefined)[];
}

/** Ambient plus this Gantt's locale. Still built once at column-resolve time (D-S4-13). */
interface FormatContext extends FieldContext {
  readonly locale: Intl.LocalesArgument;
}
```

**Three contexts, because there are three lifetimes, and a first draft of this section had two.** That draft put `children()` on `FieldContext` itself. `FormatContext` extends `FieldContext` and is built **once per column resolve** and reused for every cell (`model/field.ts`, D-S4-13), so a per-row member on that type either answers the wrong row or forces a context rebuild on the paint path. Splitting says which members are per-Dataset and which are per-pass, and the type now states the lifetime it has.

**A `compute` Field keeps its by-key read, and this is what the review caught.** Take `ctx.read` away outright and a `compute` Field can reach `entry.props` and the core dates and nothing else: not `duration`, not another `compute` Field, not a Field a plugin declared. `src/data/computed-cache.test.ts:30` is a live one that reads a sibling Field today, and the comment at `model/field.ts:224-226` publishes the promise. Worse, the author who wants a duration writes the millisecond arithmetic by hand, which `CLAUDE.md`'s time rule forbids outside `time/`. So both questions survive; only the entry argument goes.

**One name serves both callers.** An Aggregator and a `compute` Field both say `ctx.children()`, and both mean the pass's children. `RollUpContext` extends `ComputeContext`, so there is one declaration.

**Where the pass binds it.** `readField` is the one function that holds the row and the registry together, so it binds the context there, and `createFieldContext` keeps the ambient half alone. A stored-Field read builds nothing: only a `compute` arm and a Rollup pass ever receive a `ComputeContext`, and `data/computed-cache.ts` already memoizes what a `compute` produced per revision. **The cost that must not appear is a context per cell on the paint path** — `formatValue` takes `FormatContext` plus the `entry` it already receives, and neither changes here.

**`parseValue` receives the ambient `FieldContext` and the row it is parsing into** — `parseValue?(text, ctx: FieldContext, entry: Entry)`, the same shape `formatValue` already has. A date parse needs the zone, which is ambient; a parse that needs a sibling value reads it off the live `entry`. That is what makes `fieldContextFor()` (`extensions/features/inline-editing.ts:109-126`) deletable rather than merely smaller: `extensions/` holds the Entry already, and `{ timeZone: dataset.timeZone }` is public, so nothing in `extensions/` has to reach into `data/` to build one.

**A `compute` Field keeps two arguments** — `compute: (entry, ctx) => …`, and `entry` is a `StoredEntry`. **This is what closes [#214](https://github.com/Pawel-IT/FreeGantt/issues/214)**: a computed value may depend on the children, and it reads them off the context rather than off a row that cannot answer.

**Nothing needs a per-child door.** `weightedMeanByDuration` reads `ctx.values()` beside `ctx.durations()`. `diffEdit` calls `readField` directly — it sits in `data/` and already imports `entryAfterEdit` from that same file.

**Two shapes were refused.**

- **An `Entry`-shaped view over the hypothetical row.** It saves the promised call site, and it costs more than it saves: two things implement `Entry`, a reader cannot tell which one they hold, and `entry.parent()` walks out of the pass into the store and mixes two states with no warning.
- **No children at all.** A `compute` Field stays a one-row function, and #214 stays open. That gives up the reason this ADR was written.

**One condition on `duration()`.** It computes from `start` and `end` through `time/`. It must not route through `read('duration')` and the Field registry, or the circle has only moved. The Field declaration delegates **to** the computation, never the reverse. It cannot delegate to `entry.duration()` either: `readField` hands a `compute` a row the store does not hold, so the argument is a `StoredEntry` and has no such member. **One computation, three doors** — the core `duration` Field's own `compute` calls it, `entry.duration()` on the live row calls it, and `ctx.duration()` inside a pass calls it. Each door hands it a different row; none of them hands it a Field key.

**This closes [#274](https://github.com/Pawel-IT/FreeGantt/issues/274), including the half nobody was tracking.** The issue says `Duration.unit` is never read, and that is literally true:

- `formatDuration` (`core-fields.ts:52`) computes `duration.value / MS.DAY`. It assumes millisecond and never checks `unit`.
- `compareDuration` (`:59`) computes `a.value - b.value`. It compares raw numbers across units.
- `inline-editing.ts:118` produces `unit: 'day'`.

A `'day'` duration reaching `formatDuration` divides days by 86,400,000. **One producer with one unit makes both functions correct by construction**, instead of correct by luck.

**One stale comment goes with the shim.** `inline-editing.ts:110-111` says a segmented Entry's true duration is *"`layout/`'s own `durationOf`, which `extensions/` cannot reach."* **There is no `durationOf` in `layout/`.** Duration is `end - start` everywhere, gaps included.

## Closed here, and one question deferred

**Does a segmented Entry's duration count the gaps? Ruled 2026-09-11: the consumer chooses.** Core answers the span today (`end - start`, gaps counted), and that stays the default. A `measureDuration: 'span' | 'segments'` option on the `Dataset` lets a consumer ask for the sum of the Segments instead, and `entry.duration()` reads it. The option sits on the `Dataset`, not the `Gantt`: duration is a Field, the Rollup reads it before any Gantt exists, and a view may not change what a value **is**.

**The key is `measureDuration`, not `duration`** — settled 2026-09-11 on a review finding. Read the call: `new Dataset({ entries, duration: 'segments' })` announces a duration where a consumer writes data, and the word already names two things on this surface (the core Field, and `entry.duration()`). `measureDuration: 'segments'` names the job — how core measures a duration — and spends no third meaning. The union and the `'span'` default are the author's ruling and do not change.

**`TProps` at the renderer seams — deferred to [#284](https://github.com/Pawel-IT/FreeGantt/issues/284), after Build 4** (2026-09-11, author's ruling). `ColumnCellRendererContext.entry?: Entry` and `fieldValue: unknown` carry no `TProps` today (`model/field.ts:67,73`), which is why `harness/planner.ts:69,85,174` all cast. A typed `entry.read('cost')` needs a `TProps` the `Entry` carries through those same seams. The casts sit in the harness, so under `CLAUDE.md`'s stop rule they are evidence of an API gap, not a harness problem. **No build in this redesign waits on it, and no build tidies the evidence away.**

**What the gap costs today, measured 2026-09-11.** `harness/planner.ts` pays it six times: `entry.props as PlannerEntryProps` at `:69`, `:85` and `:174`, and `fieldValue as Instant` at `:104`, `:114` and `:116`. Every one is a consumer restating a type the library already knows.

**The shape of the answer, if the author takes it.** `Entry<TProps>` already carries `TProps`, so the work is to thread it through the two renderer contexts that name an entry — `ColumnCellRendererContext` and the Gantt-wide `CellRendererContext` — and to type `read<K>` off it. `fieldValue: unknown` then goes: `entry.read(key)` answers `FieldValue<TProps, K> | undefined` and the six casts go with it.

**Why it is still open.** `model/field.ts` declares `ColumnCellRendererContext` and `model/` may not import `layout/` (`model-is-leaf`). A generic on a `model/` type is free, but every seam that builds one of these contexts has to pass the argument, and `layout/renderer.ts` builds the Gantt-wide one. That is a reach across three layers on a hot path, and it earns its own decision rather than a paragraph here. **Build 1 does not close it. Build 1 files it as a `Q` entry and leaves the six casts in place**, so the evidence stays visible.
