# Refuted — do not re-derive

Each item here was drafted, probed or published, and then found wrong. Every one looks reasonable, which is why it is written down. **Read this file before you "fix" something in ADR 0011 that looks obviously factorable, obviously typed, or obviously already answered.**

| # | The idea | Why it fails |
|---|---|---|
| 1 | One shared mapped type over both edit halves | Wrong in **both** directions |
| 2 | `fieldValue<number>(id, 'ref')` | Cannot compile. Partial inference does not exist |
| 3 | A plugin type parameter on the `Dataset` constructor | Inference stops after an explicit type argument |
| 4 | `RemovableEntryKey` resolves to `'parentId' \| 'start' \| 'end'` at HEAD | It resolves to `'parentId' \| 'meta'`. The probe ran against [ADR 0012](../0012-optional-dates/README.md) |
| 5 | `Partial` at every door deletes `harness/main.ts:89`'s double cast | The widening was never the problem |
| 6 | `interactions.edit` replaces `{ key: 'start', editable: false }` | It is view-level; the gate is now data-level |
| 7 | AG Grid's `field: 'medals.gold'` is precedent for a key prefix | It navigates the consumer's own shape, not a library's namespace |
| 8 | Widen the proposed-Field test from `body` to `merged` | Keeps the write for one pass and loses it at the next save. **Its own "unify the predicate" order was a misread — corrected 2026-09-10** |
| 9 | An object keyed by Entry id for the extender's return | Integer-like keys reorder the cascade |
| 10 | Optional dates need no code in `durationOf` | Unguarded, it yields `NaN`, not a throw |
| 11 | Demotion keeps no dates and stays a rolling-up row | It becomes a normal Entry with no dates |
| 12 | A `rollUpKinds` flip must clear the undo history | The drop is one row of the transaction that caused it |
| 13 | `inline-editing.ts:113` calls `durationOf` | It **provides** one. It changes as an implementation |
| 14 | Snapshot the legal `props` key set at first load | Reopens the registration lock, and an empty Dataset can never write |

---

## 1. One shared mapped type over both edit halves

A type called `EditOf` was drafted to serve `PropsEdit` and `EntryEdit` at once, published into these documents, and found wrong on the next pass **in both directions**:

- it protected a key `TProps` marks required, which the storage door already lets a stored record lack, and
- it let `update(id, { kind: undefined })` compile.

**The halves take opposite rules, so there is nothing to extract.** They look factorable, and the mistake was made twice. See [`types.md`](../0011-consumer-values-in-props/types.md).

## 2. `fieldValue<number>(id, 'ref')`

An earlier draft of `api.md` published this call. The signature is `fieldValue<K extends FieldKey>(id, field: K)` (`model/dataset.ts:41`), so `number` does not satisfy the one type parameter. Adding a `TValue` parameter needs **partial inference** — name `TValue`, infer `K` — which TypeScript does not do. That is the same trap decision 9 cites against a plugin type parameter (#123).

**The AG Grid `getCellValue<TValue>` analogy does not carry**, because their key is not a type parameter. **A caller who knows the type narrows the result; the library publishes no type argument here** unless someone finds a signature that infers.

## 3. A plugin type parameter on the constructor

```ts
new Dataset<TaskProps>({ plugins: [scheduling()] })   // the plugin generic falls back to its default
```

TypeScript stops inferring later type parameters once an earlier one is written (`api/dataset.ts`, #123). So `plugins` stops type-checking and the plugin's keys disappear. **Module augmentation is the only route that keeps today's call site** — decision 9.

## 4. The `RemovableEntryKey` probe

An earlier draft said *"probed at HEAD"*. `model/entry.ts:31,33` ship `start` and `end` as **required**, so at HEAD the derivation resolves to `'parentId' | 'meta'`. It resolves to `'parentId' | 'start' | 'end'` only once [ADR 0012](../0012-optional-dates/README.md) lands. **0012 lands first**, so when [ADR 0011](../0011-consumer-values-in-props/README.md) writes `EntryEdit`, `{ start: undefined }` compiles. The old warning — *inert until D, three groups in between* — described the unsplit order and is stale.

## 5. The harness double cast

An earlier draft claimed `Partial` at every door buys a widening that deletes `harness/main.ts:89`'s `as unknown as`. Re-probed against the real `Dataset` class at HEAD, inside the project's own `tsconfig`: `Dataset<PlannerMeta, PlannerFields>` **already** widens to the bare `Dataset` today, with two generics and no `Partial` anywhere.

**The cast bridges two _different_ concrete instantiations.** `harness/hierarchy.ts:28` and `props.ts:30` declare the shared `window.__dataset` global as `Dataset<{ cost: number }, { cost: number }>`, and `main.ts` declares its own field shape. That conversion fails at HEAD and fails after this ADR too.

**It is a harness declaration choice, not a library gap.** Declaring the global as the bare `Dataset` deletes it today, with no ADR — every e2e read of it (`segments`, `start`, `end`, `id`) sits on `Entry`. The `Partial` rule keeps its **first** reason, which is sound on its own: `Readonly<TProps>` beside an ingest fill of `{}` is a required-key lie.

## 6. `interactions.edit` as the replacement for the core-key override

Before the `editable` ruling, `editable` gated the grid only, so `interactions: { edit: (entry, field) => … }` replaced the deleted capability exactly. **The ruling broke that replacement.** `editable` is now a data-level gate, and `interactions.edit` is a Gantt-level, view-level policy that `data/` may not import (`plans/01` §1). It gates gestures and cells; it cannot gate `entries.update()`. What does is **decision 19**, still open.

## 7. AG Grid and TanStack as precedent for a key prefix

The first pass on decision 12 cited AG Grid's `field: 'medals.gold'` and TanStack Table's `accessorKey: 'name.last'`. **They are not this.** There the consumer nested their own object and the path navigates their own shape; the library imposes nothing and owns no key on the row. That is a different question, and citing it was wrong. The real precedent is platforms that own part of a key space — HTML, Kubernetes, OpenAPI. See [`evidence.md`](evidence.md).

**The first pass's decisive objection also dissolves.** It argued a prefix welds the public name to the storage mechanism. That holds only if the prefix names **storage**. If it names **ownership**, nothing renames when a Field moves between `compute` and stored.

## 8. Widening the proposed-Field test from `body` to `merged`

It keeps a plugin cascade's write to a derived cell for one pass and loses it at the next save — **the worst of the three outcomes**, because `toJSON` omits a derived value in any case. Decision 5 ruled *drop and warn* instead.

**Corrected 2026-09-10. The "unify the predicate" instruction this item used to carry was a misread of the code.** It said *two call sites answer "did anyone propose this Field?" from two different edit sets*, and it ordered a unification ahead of [ADR 0013](../0013-what-decides-derivation/README.md). Opened and counted: `editProposesField` has **one** call site in `src/`, `rollup.ts:196`. `build-commit-change-set.ts:301` is the argument binding, not a second reader.

**The `body`/`merged` split is deliberate and documented, not a duplication.** `rollup.ts:23-26` declares both and states each one's job — `body` is *"the transaction body's edits — the Rollup yields to a field proposed here (D-S2-22)"*, and `merged` is *"body plus extension-hook edits — used to read effective child values"*. Two questions, two sets. There is nothing to unify.

**What is actually left of decision 5 is the warning, and it does not exist.** Today the Rollup overwrites a cascade's write to a derived cell in silence: the cascade reaches `merged` and never `body`, so `:196` does not yield, and `rollup.ts` imports `AggregatorFailedError` and raises nothing else. Decision 5 ruled *dropped, and the library raises one warning through `raiseError` at `severity: 'warning'`*. **The drop already ships. The warning is the build.**

**Do not mistake `reportCorrectedRollUps` for it.** That function is a `fromJSON` reconciliation report (`code: 'rollup-corrected'`, `serialization/index.ts:86`): it fires when a Document's stored rolled-up dates disagree with the dates this build computes. It never sees a cascade. [ADR 0013](../0013-what-decides-derivation/README.md) deletes it for an unrelated reason — under the omission rule the Document carries no derived dates, so the disagreement cannot exist.

## 9. An object keyed by Entry id for the extender's return

```ts
return { 'phase-1': { start: moved.start, props: { risk: 'high' } } };   // ✗
```

JavaScript walks integer-like string keys first and in ascending numeric order, so `{ '10': …, '2': … }` iterates as `2` then `10`. Entry ids are consumer strings and numeric ids are ordinary, so a `Record` silently reorders the cascade — and the merge is last-wins per Field key, which makes order load-bearing. `__proto__` as an Entry id is the second hazard on the same container. **Keep the `Map`, or take an array of `[id, edit]` pairs.** The three ergonomic complaints in decision 16 stand under either container.

## 10. Optional dates need no code in `durationOf`

An earlier draft said the blank `duration` cell needs no code written for it. **That is wrong, and the failure it hides is silent rather than loud.**

```ts
durationOf(entry: Entry): Duration {
  return { value: diffMs(entry.end, entry.start), unit: 'millisecond' };   // no guard
}
```

`diffMs(a, b)` is `a - b` (`time/instant.ts:41-43`), so an absent date yields **`NaN`, not a throw**. `formatDuration` returns `''` only for `undefined`/`null`; `{ value: NaN }` is neither, so the cell renders **`"NaN d"`**, and `weightedMeanByDuration` weights by `NaN` and poisons the parent's aggregate.

**Guard `field-access.ts:92` first** — `if (entry.start === undefined || entry.end === undefined) return undefined;` — and the blank cell and the skipped child both follow. Do not invent an em dash or a placeholder.

## 11. Demotion keeps no dates and stays a rolling-up row

An earlier line said demotion is *"not a dateless row"*. **It is one.** There is nothing to calculate from, so `start`/`end` are absent, and the Entry becomes a **normal Entry with no dates** that can be dated later. What it is *not* is a childless `'group'` that stays rolling-up and draws no bar.

**It was also mis-tied to [#270](https://github.com/Pawel-IT/FreeGantt/issues/270).** #270 is a **declining Aggregator that saw children**; a childless parent never reaches an Aggregator at all (`rollup.ts:184,191` skip it first). #270 stands on its own, and demotion does not touch it.

## 12. Clearing the undo history on a `rollUpKinds` flip

An earlier draft argued that replaying a step whose `from` is an authored parent value would restore a value the new setting refuses, and it wiped the whole history to escape that. **It read the drop as a lone row.** The drop is one row of the transaction that caused it:

```
  commit:  child 'a' gains parentId 'p'      ← the cause
           p.cost   500 → 40                 ← the drop, same ChangeSet

  undo:    child 'a' loses parentId 'p'      ← the cause reverses
           p.cost    40 → 500                ← so 500 is authored again, and legal
```

Nothing replays a value the new state refuses, because the new state goes back with it. **History is never cleared, and `RollUpKindsWouldDropValuesError` is not added.**

One door does not carry its cause in the same transaction, and that follow-up is real: a `rollUpKinds` flip's cause is a **config assignment**. See decision 6 in [0013 closed decisions](../0013-what-decides-derivation/README.md#closed-decisions).

## 13. The `durationOf` call sites

**Do not re-derive this list.** An audit built it after a review named two call sites and got one of them wrong. It is in [ADR 0012's work](../0012-optional-dates/README.md#the-work). The one the review got wrong: **`inline-editing.ts:113` is a provider, not a caller** — `fieldContextFor` builds a `FieldContext` and supplies its own `durationOf`, so it changes as an implementation.

## 14. Snapshotting the legal `props` key set at first load

**Proposed 2026-09-10, while decision 1 was being ruled.** Take the union of `props` keys present at construction as the writable set. Anything new after that is invalid. It reads as the best of both: no declaration to write, and a typo is still caught — FullCalendar's open top level, closed.

**It does not buy what it looks like it buys.** The cost of an undeclared write comes from the **missing declaration**, not from the missing permission. Per-key merge in a transactional store needs per-key identity, equality and ordering, and a key that merely *appeared in the payload* supplies none of them. So the snapshot pays all three edits the merging patch pays — `proposedKeys` seeded from inside `props`, `diffEdit` draining undeclared keys, and a second `fieldValue` path. **It is the merging patch with a gate on it.** What makes decision 1's answer cheap is that a carried key *never changes*; the gate chooses *which* undeclared keys are writable, not *whether* any are.

**And two failures, the second fatal.** An empty Dataset — `new Dataset({ entries: [] })` — has an empty writable set for its whole life, so the ordinary start-empty-and-build-up flow can never write a consumer key. The obvious patch, letting `add()` extend the set, **reopens [the registration lock](rulings.md#the-registration-lock--fields-and-plugins-are-fixed-at-construction)** and the four things that depend on it: `FieldRegistry.all` is one array identity for the registry's life and readers cache by identity with no invalidation branch; `diffEdit`'s row order cannot change mid-life; `toJSON` must not depend on *when* it is called; the construction Rollup walks once.

**It also hands the write surface to the upstream API.** A column added upstream silently opens a write door; one dropped silently closes it. The `props`-value ruling exists *because* upstream schemas drift, and its posture is *warn, ignore, core wins, never break the consumer*.

**What survives from the idea, and it is worth building.** The same `Object.keys(input)` walk that already raises two ingest warnings can raise a third: *"`phase` arrived in `props` on 12 entries and no Field declares it. Declare `{ key: 'phase' }` to make it writable, sortable and formattable."* That is **discovery**, not permission — it points at the one-line fix and changes nothing in the store.

## Also dropped, with no argument left to make

- **A conditional slot type that keeps a required `TProps` key required.** Drafted and dropped: it adds a public name and a second shape at two doors, and no consumer has asked.
- **Generalizing `reportCorrectedRollUps` past `start`/`end`.** It would find the disagreement. Not writing the value stops the disagreement existing.
- **A per-entry `pluginData` key on the Entry.** It splits one namespace by an owner and adds a fourth Document key, and it does not stop two plugins colliding unless it is keyed by plugin id — at which point it is decision 9's option C with extra steps.
