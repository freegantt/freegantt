---
status: proposed — draft, not decision. Opened 2026-09-11, out of a design session on the plugin variant surface. Revised the same day, after a review from the field-redesign build raised seven problems (P1–P7). All seven were verified at HEAD before this revision. The working material is in `plans/row-redesign/`.
decided: `Entry` and `StoredEntry` are **two types**, and no derived type reads `keyof` `Entry` (P1, P3). A read seam receives an `Entry`; the edit pipeline carries `StoredEntry` values (P2, P4). The names were ruled on 2026-09-11 — see *The names*. `EntryStoreView.childrenOf` and `EntryStoreView.fieldValue` are deleted — one question, one call site. A removed id carries no flag; existence stays `entries.has(id)`. Any earlier ADR may change where the change buys a cleaner API.
open: whether the renderer contexts become generic over `TProps`.
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
| `src/model/field.ts:303,325-337`            | `Aggregator = (children, parent, ctx) => …`, and `FieldDistributor` and `RollUpContext.values(children)` take the same pair     | `children` is always the children of `parent`. It rides beside `parent` because `parent` cannot answer. This is the surface a consumer writes an Aggregator against.                                              |
| `src/layout/items/produce-items.ts:235,272` | `resolveItems(entry, registry, hasChildren: boolean)`; `produceItemsForRow(…, hasChildren: (id) => boolean)`                    | Read it aloud: "resolve items, entry, registry, has children." A fact about one row, threaded as a positional argument through a call about a frame.                                                              |
| `src/view/capability.ts:92-118`             | `CapabilityInputs` takes five injected functions: `hasChildren`, `descendantsOf`, `fieldFor`, `lookOf`, `registeredDefaultsFor` | Every one is a question about one row. Core built this object by hand, out of side channels.                                                                                                                      |
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

  readonly hasChildren: boolean; // a getter: one value, off the fast path
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
| `Aggregator`, `FieldDistributor`, `RollUpContext`                 | `entryAfterEdit` and its five callers (`field-access.ts:242`)         |
| a `compute` Field's context                                       | a `ChangeSet`'s `{from, to}` values                                   |
| a command's `when` and `run`                                      | `CoreFieldKey` and `CoreFieldValues`, which derive from `StoredEntry` |
| `entries.get`, `entries.all`, the value `entries.add` returns     | `EntryInput`, which is what a consumer writes                         |

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
4. **A getter answers one value. Anything that returns a collection is a method.** `hasChildren` is a getter and rides the `#hasChildren` fast path. `children()`, `parent()` and `descendants()` carry parentheses, because each one may allocate or walk.
5. **`read()` is the one value door**, so `entry.props` leaves the read surface. [ADR 0014](0014-the-plugin-author-surface.md) decision 13 already picked `read` as the name. This keeps the name and drops one of its two surfaces.

**The `Entry` reads. The store writes.** There is no `entry.update()`. `dataset.entries.update(id, edit)` stays the one write door, and [ADR 0015](0015-what-the-write-door-refuses.md) keeps everything it decided.

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

**Core stops re-deriving.** `CapabilityInputs`' five injected functions collapse to the `entry` argument. `gantt-shell.ts:1141` and `:1148` go. `resolveItems`' positional `hasChildren` goes. `#hasChildren` stops being private.

**The Aggregator surface loses an argument.** `Aggregator = (parent, ctx) => …` and `FieldDistributor = (value, parent, ctx) => …`, because `parent.children()` answers what `children` was passed for. **`RollUpContext` keeps its own reads.** `rollup.ts:23-26` holds two edit sets for two questions — `body` and `merged` — and refuted item 8 stored values that the split is deliberate. An `Entry` answers the store's overlay, which is neither of them. Do not delete `ctx.values()` on the strength of this paragraph.

**The public surface gets smaller, not larger.** `EntryStoreView.childrenOf` and `EntryStoreView.fieldValue` become `Entry` members. The cost is `entries.get(id)?.children() ?? []` where a call site used `childrenOf(id)`. **Ruled 2026-09-11: they go.**

**P7 — this ADR deletes `fieldValue`, which is what HEAD ships** (`model/dataset.ts:28`). [ADR 0014](0014-the-plugin-author-surface.md) renames it to `read` and is unbuilt. Whichever lands first, one rename happens, not two. 0014 is **not** a precondition of this ADR.

**A removed id carries no flag.** An `Entry` outlives its `StoredEntry` and keeps the last values it read. Existence has one door already — `entries.has(id)`, and `entries.get(id)` answering `undefined`. A `removed` boolean would be a second door onto the same fact, and it would invite an `if (entry.removed)` branch at every reader. Nothing in core needs one: the edit pipeline carries `StoredEntry` values, so undo and replay never meet an `Entry`.

**[#214](https://github.com/Pawel-IT/FreeGantt/issues/214) closes.** A `compute` Field receives an `Entry` and walks `entry.children()`.

**Four sites outside the store stop reading `.parentId`.** `layout/rows/entries-source.ts:16`, `layout/frame-memory.ts:77`, `view/tree-collapse.ts:111,153` and `data/rollup.ts:46,52` each ask what the tree is by reading the stored field. They ask `entry.parent()`, `entry.children()` or `entry.hasChildren` instead. This is the part of the work [0020](0020-a-plugin-may-own-the-hierarchy.md) cannot land without: a site left reading the field disagrees with the library the moment a plugin owns the hierarchy. `data/entry-reader.ts:229,567` name `parentId` too, but those two **write** the stored value and stay as they are.

**`spansTime(entry)` stays a free function.** It narrows the type, and a getter cannot. It reads `start` and `end` only, so it serves both types.

## Open

**`TProps` at the renderer seams.** `ColumnCellRendererContext.entry?: Entry` and `fieldValue: unknown` carry no `TProps` today (`model/field.ts:67,73`), which is why `harness/planner.ts:69,85,174` all cast. A typed `entry.read('cost')` needs a `TProps` the `Entry` carries through those same seams. The casts sit in the harness, so under `CLAUDE.md`'s stop rule they are evidence of an API gap, not a harness problem. This ADR should close it rather than inherit it.
