# ADR 0011 — a consumer value has a home

**The decision:** [`docs/adr/0011-…`](../../../docs/adr/0011-consumer-values-live-in-props.md)

A consumer's values move from `meta` to **`props`**, and a Field key becomes the whole address, so `FieldSource` retires. `{ key: 'cost' }` reads and writes `entry.props.cost`. `{ key: 'start' }` reads and writes `entry.start`. Nothing declares a `source`.

**This is the ADR that simplifies the API.** The other four came out of it in the 2026-09-09 split, because each answers a different question and none of them is *where does a consumer value live*.

## Read the one you need

| File | Read it when |
|---|---|
| [`types.md`](types.md) | You are about to write the edit types or the Field union |
| [`api.md`](api.md) | You want this ADR's call sites, before and after |

The shared files — [`refuted.md`](../shared/refuted.md), [`evidence.md`](../shared/evidence.md), [`rulings.md`](../shared/rulings.md) — are indexed in [`../README.md`](../README.md#shared).

## Where it stands

**No decision is open.** Seven numbered decisions are closed — **1**, 2, 10, **11**, **Q15**, 17, **22**, and the `props`-names-a-core-key ruling. Q15 closed 2026-09-10 (grill).

**It lands after [0016](../../../docs/adr/0016-the-library-holds-no-save-format.md) and [0012](../0012-optional-dates/README.md).** [0012](../0012-optional-dates/README.md) is decision-free and touches three of the same files, so it goes first and this ADR rebases onto it. `EntryEdit`'s removable keys follow `Entry`, so 0012 first also makes `{ start: undefined }` compile here. **There is no Document.** ADR 0016 deleted it, so this ADR writes no schema number. The Document rename was the large half; what is left is the write path and the type renames.

## The write resolver is this ADR's to move, and not its to re-rule

**This ADR moves the resolver into `data/` with HEAD's policies unchanged, and spends no decision on it.** The whole story — one function, three owners, one at a time — is in [`../README.md`](../README.md#the-write-resolver-one-function-three-owners). The build step is [below](#the-build--the-address-rule-and-the-storage-rename).

## What this ADR does *not* decide

- **Where a plugin's values live.** They sit in `Entry.meta` today (`field-registry.ts:148`), and `Entry.meta?: TMeta` is consumer-typed already. This ADR ships `props: Readonly<Partial<TProps>>` — HEAD's exact posture under a new name. [0014](../0014-plugin-author-surface/README.md) decisions **9 and 12** (closed 2026-09-10) then widen additively: `TProps & PluginEntryProps`, plugin keys prefixed.
- **Whether the core-key override survives.** `#mergeCoreFieldOverride` merges `editable` and **never touches `source`** (`field-registry.ts:211-225`), so `FieldSource` deletes cleanly around it. The override is [0015](../0015-write-door/README.md)'s. **Decision 19, closed 2026-09-10, keeps it.**
- **What a rolling-up parent's `props` does.** This ADR rules `props` is carried by reference. [0013](../0013-what-decides-derivation/README.md) adds the one exception.

---

# Open decisions

**None.** Q15 closed 2026-09-10 (grill) and is below with 1 and 11.

---

# Closed decisions

## 1 — an undeclared key is carried, and `update()` never names it

**Closed 2026-09-10. Ruled by the author.** Was: *may an undeclared key travel in a `props` patch?* Settled *yes* on 2026-09-08, re-opened 2026-09-09 by a survey, and ruled on the recommendation.

**The ruling. Records carry, patches name.** Constructor ingest **carries** an undeclared `props` key — store it, never touch it. `add()` and `update()` **name** a key, so naming an undeclared one throws `UnknownFieldError`. **Grill 2026-09-10:** `add()` is a patch door, not an ingest door. Constructor `entries` is Q15, closed below. There is no `fromJSON`.

**No flag, no keyword, no second declaration shape.** An undeclared key is kept in the Document because keeping it costs nothing, not because a consumer asked for it. `{ key: 'x', carry: true }` was weighed and refused: a consumer should not annotate data to stop the library discarding it.

**Why carrying is free, and it is the whole reason this answer is cheap.** An undeclared value never changes. So nothing diffs it, and it needs no `equals`; it never earns a ChangeSet row, so it needs no row order; undo never holds it; and `fieldValue` keeps its `UnknownFieldError` guard with one code path. The three edits the merging patch needed — seeding `proposedKeys` from inside `props`, draining undeclared keys in `diffEdit`, and answering `entry.props[key]` from `fieldValue` — **are not needed at all.**

**What a declaration means, stated once.** A Field declaration is a **handling** contract, not a storage permission: declare a key and the library will sort it, format it, roll it up, track it in a ChangeSet and let `update()` write it. Leave it undeclared and the library carries the value and handles nothing. Those are two jobs, and `props` does both.

**Two consequences to publish, because neither is obvious.**

- **A passenger key is immortal for that Entry's life.** A consumer cannot remove one through `update()`, because naming it throws. They replace the whole Entry, or re-ingest. That follows directly from *never changes*.
- **One guard is load-bearing for data retention, not only for plugin composition.** `entryAfterEdit`, `mergeEntryEdits` (`edit-extension.ts:38`) and `mergeStoredEdits` (`field-access.ts:49`) must merge `props` **per key**. `{ ...base, ...extra }` replaces the whole bag, so a shallow spread silently deletes every passenger key the other edit did not restate. **This ruling makes those two merges non-optional.**

**What lost, and why.** *Atomic bag* (HEAD) — `update({ props: { cost: 7 } })` drops `owner`; reads like a merge, is a replace, and is the bug this ADR exists to close. *Declared-only transport* (Bryntum's and AG Grid's shape) — coherent, and it forces a Field declaration for a renderer-only key such as an avatar URL, and it loses sixteen keys of consumer data when a Document written by a build with twenty declarations is read by a build with four. *FullCalendar's per-key setter* — true English, and it affords that only because it has no ChangeSet, no diff and no undo. *The merging patch* — pays all three edits above, plus rows with no `equals`, plus a `fieldValue` that stops meaning Field. *A key set snapshotted at first load* — reopens [the registration lock](../shared/rulings.md#the-registration-lock--fields-and-plugins-are-fixed-at-construction) the moment `add()` extends it, and leaves an empty Dataset unable to write anything for its whole life.

**Spiked** — `spike/0011-undeclared-props-patch`, 34 passed, five toy stores scored on rules-to-learn and on the call a person reads. The *"nobody ships per-key merge over an undeclared space inside a transactional store"* claim is carried from [`evidence.md`](../shared/evidence.md) as a **survey**, not as a probe result.

**The error message carries the migration, so it ships with the ruling.** `errors.ts:331` currently says *"put the value in `meta`"*, pointing at the bag this ADR deletes. Replace it: *"'extra' is not a declared Field, so add() / update() cannot name it. Declare it: `{ key: 'extra' }` — or put it in constructor `entries` inside `props`, where undeclared keys are kept."*

**One known hole, unchanged and accepted.** The type says yes where the runtime says no — `PropsEdit` maps `keyof TProps`, and `TProps` membership is not Field declaration:

```ts
interface PlannerProps { owner?: string; phase?: number }   // phase is in TProps…
fields: [{ key: 'owner' }]                                  // …and declared as no Field
update('t1', { props: { phase: 3 } })   // ✅ compiles   ❌ throws UnknownFieldError
```

Closing it needs declared-key inference from a `fields` literal — [#267](https://github.com/Pawel-IT/FreeGantt/issues/267)'s machinery, out of scope. It is the posture `fieldValue` already takes at HEAD, and the error names the fix.

**One residue this ruling does not settle.** A **plugin cascade** naming a Field it never registered. Registration closes when `setup()` returns (`RegistrationClosedError`), so a plugin that computes a key name later has no way to declare it. Today that write succeeds. **Taken as following the same rule by default — the hook writes through the same door, and a plugin declares in `setup()`** — and recorded here so it can be reversed in one line if a plugin author meets it.

## 2 — `entries.add({ props })` emits one changeset row

**Settled 2026-09-08.**

One `EntityAdded` row carries the whole Entry as stored. Per-Field rows would undo one user action in several steps. The row states what the store now holds rather than what the call passed — after a dropped derived value, and after ingest fills `props: {}` and the Segments.

## 10 — what a `compute` Field shows on a rolling-up parent

**Closed 2026-09-09.** Its own recommendation ended *"take this off the blocking list"*, and nothing gated on it.

**`compute` runs on every row, a rolling-up parent included.** The union closes storage, not reading. A `compute` Field reading `entry.props.cost` on a group sees what the Rollup put in the store — a stored read through a door the union never closed. Blanking it would put `{ key: 'ref', compute: (e) => rowNumber(e.id) }` at an empty cell on every group row, which a consumer reads as a bug. The real limit is that a `compute` Field cannot ask *am I a parent?* — that is [#214](https://github.com/Pawel-IT/FreeGantt/issues/214).

## 11 — `update()` is flat only

**Closed 2026-09-10. Ruled by the author.** Was: *does common case is a shorthand survive for Field writes?*

**The ruling. `update()` names every Field on one object, with no `props:` wrapper.** The call `plans/02:467` already teaches is the write:

```ts
dataset.entries.update('t1', { start: '2026-10-05', cost: 12_000 });
```

Declared consumer keys sit next to core keys. Nested `props:` is refused at `update()` and at `add()` (grill 2026-09-10). `props` stays on the Document and on a complete `ProposedEdit`. Constructor `entries` is Q15, closed below. There is no `FieldNamedAtTopAndInPropsError`: one place to name a key on a patch, so the double-name throw never exists on `add()` / `update()`. Constructor ingest that names a declared key both at the top and inside `props` throws — that is Q15.

**What lost, and why the ADR's own rejection is overruled.** Nest-only (`update('t1', { start, props: { cost } })`) names a container the app author should not meet. Shorthand *plus* nest keeps two spellings and invents the double-name throw for [0015](../0015-write-door/README.md) to type. This ADR's considered options had rejected *"flat consumer keys on the edit alone, with `props` everywhere else"* because the object a consumer writes most often would disagree with the object the library holds. **Decision 1 already splits those doors:** ingest carries an undeclared key, `update()` throws for it. A shape split is smaller than that split, and it is the call the locked spec already shows. The author ruled the call site.

**What it costs.** A consumer who builds one object and passes it to the constructor and to `update` writes two shapes: constructor ingest may nest `props` for passengers, the JS write is flat. The call an app author writes every day is `update(id, { cost })` and `add({ id, name, cost })`. `update(id, { props: { cost } })` throws, and the message says to name `cost` at the top.

**The top level stays closed.** `update('t1', { strat: 1 })` still throws `UnknownFieldError` — decision 1. This is not FullCalendar's open top level. A key that is on `TProps` but is not declared still compiles and throws — that is [#267](https://github.com/Pawel-IT/FreeGantt/issues/267), unchanged.

**Spiked** — combined spike `update-flat/`, Improvement A. Ruled as the write door, not as an optional follow-up. The types are in [`types.md`](types.md).

## Q15 — constructor `entries` take declared keys at the top

**Closed 2026-09-10 (grill).** Was: *is `new Dataset({ entries })` the same shape as `add()`?*

**The ruling.** Constructor `entries` accept declared Field keys at the top, the same as `add()`. Nested `props` stays legal on a constructor record for passenger keys and for a bag you already hold (a server payload). Unknown top-level keys **warn and are ignored** — ingest, not a throw, so one extra column from an API does not crash the page. There is no `fromJSON`. A declared key named both at the top and inside `props` throws.

```ts
new Dataset({
  entries: [
    { id: 't1', name: 'Survey', start: '...', end: '...', owner: 'Ali' },
    { id: 't2', name: 'Legacy', props: { extra: 1, owner: 'Jo' } },
  ],
  fields: [{ key: 'owner' }],
})
```

`add()` still refuses `props:` and throws on an undeclared top-level key. Two jobs: a named write is strict; construction ingest is loose at the top and still has a bag.

## 17 — the namespace is `props`

**Closed 2026-09-09. Ruled by the author.** Was: *should the namespace be called `props` rather than `data`?*

`props` it is. `Entry.props`, `EntryInput.props`. There is no `props` key on `EntryEdit` — decision 11, closed 2026-09-10: `update()` is flat. There is no `EntryDocument`.

**Why `data` lost.** `data/` is a core layer, so `data` would name a layer and a consumer's bag at once. The mitigation on offer was a prose convention — *write `data/` for the layer and `entry.data` for the bag, never the bare word*. `plans/02` rules that a generic word covering more than one concept is a bug rather than a style nit, and #7 is the cautionary case: "chart" named the public instance and an internal class, and the fix was to **retire the word**, not to write a disambiguation rule and trust context. `data` is the most generic word available.

**What it costs.** One inversion for a reader arriving from tldraw, where `props` is the library's own validated schema and `meta` is the consumer's free-form bag. That is one product's pairing, weighed against a collision on every page of this repo.

**What it deletes.** The prose sweep owes a glossary rule for the `data/`-against-`entry.data` collision. There is no collision, so there is no rule to write.

**Checked before ruling:** `props` and `TProps` appear nowhere in `src/`.

**Renames that follow:** `DataEdit` → `PropsEdit`, `TData` → `TProps`, `ConsumerEntryData` → `ConsumerEntryProps`, `PluginEntryData` → `PluginEntryProps`, `PlannerMeta` → `PlannerEntryProps`, `DemoMeta` → `DemoEntryProps`. The ADR file itself is renamed, which ADR 0006 permits while its status is `proposed`.

**Decision 12 closed on 2026-09-10 in [0014](../0014-plugin-author-surface/README.md):** plugin keys carry a prefix. The word `props` did not wait on that marker.

## 22 — brand the whole `ProposedEdit`

**Closed 2026-09-10. Ruled by the author.** Was: *does `ProposedEdit` carry a brand, or does an extender diff its proposed keys?*

**The ruling. Brand the whole `ProposedEdit`.** It is not assignable to `EntryEdit`. `{ ...proposed }` as a returned edit is a type error. `PropsEdit` stays an app-author type with no `__brand`.

**The trap this closes.** After the rename a complete `props` and a `props` patch are the same shape. A plugin that spreads `request.proposed.get(id)?.props` into a returned edit proposes every stored key by accident, derived cells included. The patch already merges, so the spread is never needed. A doc comment does not hold it: the spread reads as *keep everything and add one*.

**Why not the inner bag.** Branding `PropsEdit` would put `__brand` on the type an app author writes. Whole-edit brand refuses the spread at the seam and leaves `PropsEdit` clean. The combined spike `brand-whole/` proved the whole-edit refusal; an inner-bag probe assigned through a cast and did not re-prove it.

**Why not diff.** Seeding proposed keys by diff against the pre-state would make a write of the same value stop being a proposal. That is a behaviour change at the hook. A brand is a type change only.

**[0014](../0014-plugin-author-surface/README.md) decision 16** closed against this type on 2026-09-10.

The type, and the refused spread, are in [`types.md`](types.md).

## A `props` key that names a core key — warning, and the core definition wins

**Closed 2026-09-09. Ruled by the author.** It was never a numbered decision. It sat as the fourth bullet of decision 12 (which recommended an **error**) and as a Consequences bullet (which stated a **warning**), marked *contested*.

**A warning, the value is ignored, and core's own definition is used.** `props: { start: … }` never throws.

**The reason is where the data comes from.** A consumer feeds this Dataset from an API they do not own. A column added upstream, named `start` or `kind` or `name`, must not break their page. A warning names the key and the app keeps running.

The leak decision 12 worried about — *it stores a value no door can read back* — closes anyway, because the value is not stored.

**12 and 23 closed 2026-09-10.** Plugin keys carry a required prefix; core and consumer keys stay bare; the reserved list is the declaration guarantee. The *declaration* half is [0015](../0015-write-door/README.md) decision 23: `{ key: 'start', editable: false }` is the lock; extra keys on a core name throw. This ruling stays the *value* half: `props: { start: … }` is a warning, never a throw.


---

# The work

## The build — the address rule and the storage rename

The key decides the home, so no declaration carries one.

- `Entry.meta` → `Entry.props`, non-optional, filled `{}` at ingest. `Entry.props: Readonly<Partial<TProps>>`. Input keeps `props?`. There is no Document.
- **Ingest must walk inside `props` on a nested constructor record, or a declared Field value is dropped in silence.** `writeDeclaredMetaFields` (`data/fields/field-access.ts:141-155`) finds a consumer Field value on an edit today, and it walks the edit's **top level**. That still works for `add({ cost })` and `update({ cost })` after decision 11. It does **not** work for a constructor record that still passes a bag: that has one top-level key, `props`, and this ADR **deletes** the `props` core Field — so `registry.get('props')` misses, `continue` fires, and the value is never written. No error, no ChangeSet row. Walk declared keys at the **top** of constructor `entries` (Q15) **and** inside `props` on that record. `add()` and `update()` stay a top-level walk of declared keys. A declared key named both at the top and inside `props` on a constructor record throws. Unknown top-level keys on a constructor record warn and are ignored. There is no `fromJSON`.
- Write the edit types from [`types.md`](types.md). `EntryEdit` is the envelope plus declared-key shorthand at the top level — **no `props` key**. `add()` takes that same type. `PropsEdit` is exported for a complete `ProposedEdit`, and constructor `entries` that still pass a bag. Do **not** write `Partial` on either half, and do **not** factor them into one shared mapped type. Seven type tests. `update(id, { props: { cost } })` is a type error, or a runtime throw whose message says to name `cost` at the top. `add({ props: { cost } })` is refused the same way.
- **`StoredEdit` → `ProposedEdit`, with serena.** About 184 occurrences. `ProposedEdits`, `toProposedEdit`/`toProposedEdits` and `EditReading.proposed` follow. Lands in A because A already renames the type's own field. Write `ProposedEdit`'s **type** too — `props` is required on it — and **brand the whole `ProposedEdit`** (decision 22, closed 2026-09-10). `PropsEdit` carries no `__brand`.
- Public plugin generics lose the second type parameter: `DatasetPlugin`, `DatasetPluginContext`, `DatasetOptions`. There is no `Dataset.fromJSON`.
- `build-commit-change-set.ts:100`'s `fieldsWrittenBy` still skips `'meta'`, and `field-access.ts:26`'s `isOptionalEntryKey` still names it. Both follow the rename.
- **Leave `#mergeCoreFieldOverride`, `#consumerOverriddenCoreKeys`, `CORE_FIELD_OVERRIDABLE_KEYS` and `illegalCoreOverrideKey` standing.** The merge reads `editable` and never reads `source` (`field-registry.ts:211-225`), so `FieldSource` deletes cleanly around it. [0015](../0015-write-door/README.md) decision **19** (closed 2026-09-10) **keeps** the override for `editable`. It does not serialize — ADR 0016 deleted the Document. Decision **23** is the three declaration shapes, also closed.
- **Move `libraryWriteRule` (`view/capability.ts:113-121`) into `data/`, and change no policy in it.** Point `view/capability.ts` at the moved function, and stop that file restating the rule. **`entries.update()` keeps HEAD's `UnknownFieldError` only.** Do not wire it to a policy this ADR did not rule, and do not write 0013's or 0015's tests here. Why the three arms split this way: [`../README.md`](../README.md#the-write-resolver-one-function-three-owners).
- **Two merges shallow-spread, not one. Fix both together or plugin composition breaks in production.**
  - `data/edit-extension.ts:38` — `mergeEntryEdits`, the loose one a plugin author calls. With consumer keys inside `props`, two extenders writing different `props` keys lose one: #197 one level down, against that function's own stated promise (#238).
  - `data/fields/field-access.ts:49` — `mergeStoredEdits`, which the **commit path** uses to fold body + cascade + hierarchy. `{ ...base, ...extra }` has the identical hole, and here it breaks a contract written directly above it: *"`extra` wins per Field key; the proposed keys of both survive."* That is true today only because a top-level key **is** a Field key. Once `props` is one key holding many, `extra` wins per **namespace**, so a body write of `props.cost` beside a cascade write of `props.progress` loses `cost` — while `proposedKeys` still names it, so the ChangeSet emits a row carrying a stale value. **A wrong row is worse than a dropped write**, and only this one is reachable without a second plugin installed.
- Two ingest warnings, one `Object.keys(input)` walk per Entry against `CORE_FIELDS` plus `'props'`: an unknown top-level key, and a key inside `props` that names a core key.
- Delete `FieldSource` and all three arms, `Field.source`, `source-strategy.ts`, `normalize-source.ts`, `metaRecord` / `metaKey` / `metaSlot`, `DuplicateFieldSourceError`, `InvalidFieldSourceError`. (`SerializedField` went with ADR 0016.)
- Delete the `meta` core Field with **no successor**.
- `CoreFieldKey = keyof Omit<Entry, 'id' | 'props'>`, and `CoreFieldValues` omits `'props'` with it. The registry refuses `{ key: 'props' }` — the **one** reserved key.
- `'compute' in field` replaces the compute-arm test. **Build 0016 already took the serialization arm** — `computeStrategy.serialize()`, `encodeDeclaredField` and `encodeFieldDocument` went with `data/serialization/`. What is left to unpick is `writeStoredSource` and the read/write arms. Delete the strategy table.
- **This ADR declares `ComputedFieldCannotBeWrittenError` and throws it at registration.** [0013](../0013-what-decides-derivation/README.md) declares and throws `DerivedFieldNotWritableError`. [0015](../0015-write-door/README.md) declares and throws `FieldNotEditableError`. Every new error is a named `FreeGanttError` with a `code:` and a `plans/02` §7 row.
- `view/capability.ts`'s `hasSomewhereToWrite` becomes `!('compute' in field)`.
- One generic. `harness/planner.ts:31` currently writes two that disagree about `critical`.
- Rename fixture types: `PlannerMeta` → `PlannerEntryProps`, `DemoMeta` → `DemoEntryProps`.
- The registry's `authored` comment states plugin values sit in `Entry.meta`. One word changes to `props`. [0014](../0014-plugin-author-surface/README.md) decisions **9 and 12** (closed 2026-09-10) keep those values in `props` under a plugin prefix. The sentence stays; the word and the key change.
- **Not ADR 0011's:** the `harness/main.ts:89` double cast. Declare `window.__dataset` as the bare `Dataset` first, independently — see [`refuted.md`](../shared/refuted.md).

## The build — the merging patch

Written in the new names: `toProposedEdit`, `ProposedEdit`.

- `toProposedEdit` merges the `props` patch onto the Entry's own record, so a `ProposedEdit` always carries a **complete** `props`. The merge belongs on the read side, not the apply side.
- `entryAfterEdit` merges `props` rather than replacing it.
- An explicit `undefined` inside a patch clears that one key.
- `diffEdit` emits one row per Field key, never a path into `props`.

**[Decision 1](#1--an-undeclared-key-is-carried-and-update-never-names-it) deletes three edits from this group.** They are **not built**:

- ~~**a.** Seed `proposedKeys` from inside `props`, not only from top-level keys.~~
- ~~**b.** `diffEdit` keeps the registry walk for row order, then drains undeclared keys in the proposed set.~~
- ~~**c.** `entries.fieldValue` and `ctx.read` answer `entry.props[key]` for an undeclared key.~~

**`"Skip a–c"` is not `"do not look inside"`, and this is the trap in the group.** On an `EntryEdit` — `add()` and `update()` — the first `Object.keys(edit)` loop names declared keys at the **top**. On a nested record — constructor `entries` that still pass a bag — the walk goes **inside** `props` for **declared** keys, or a declared `cost` on ingest emits no row. Constructor records also name declared keys at the top (Q15). Only the *undeclared* names are skipped in the seed. `UnknownFieldError` stays on the top level of an `EntryEdit` either way. There is no `fromJSON`.

**Two build steps ship with decision 1 rather than after it.** The `errors.ts:331` message rewrite, and per-key `props` merging in `entryAfterEdit`, `mergeEntryEdits` and `mergeStoredEdits` — a shallow spread deletes a carried key.

**[Decision 11](#11--update-is-flat-only) is the write door**, and [decision 22](#22--brand-the-whole-proposededit) is the brand. The types for both are in [`types.md`](types.md).

## Done first — 2026-09-09

`mergeColumn` now spreads `sizingPairOf(…)` — the `width`/`flex` pair alone — instead of the whole type-bundle column. Four test rows in `field-registry.test.ts`. `verify:full PASS — all 16 checks green, test:e2e included`. Independent of the ADR; cherry-picks to `main`.


## Naming already landed

`9c3f704` renamed the conversion family. Write against: `toStoredEdit` / `toStoredEdits`, `toEditReading` / `toEditsReading`, `toEntry` / `toEntries`, `entryAfterEdit`, `extraEditsReadingFor`. `fromDocument` / `toDocument` went with ADR 0016.

**Still owed in this ADR:** `StoredEdit` → `ProposedEdit`, `toStoredEdit` → `toProposedEdit`. Until it lands, today's code still reads `toStoredEdit`.

## No Document

[ADR 0016](../../../docs/adr/0016-the-library-holds-no-save-format.md) deleted the save format. This ADR writes **no schema number**.

- Unknown key inside `props` on constructor ingest is passenger data and is kept. Unknown top-level key warns and is ignored.
- **`props` is carried by reference.** [0013](../0013-what-decides-derivation/README.md) bends D-S2-12 in one place, on a rolling-up parent, and says so where D-S2-12 is written.
