# ADR 0015 — what the write door refuses

**The decision:** [`docs/adr/0015-…`](../../../docs/adr/0015-what-the-write-door-refuses.md)

How strict is `entries.update()`? What does an *absent* `editable` mean there, what replaces the deleted core-key override, and does a consumer declaration on a core key throw?

## Where it stands

**No decision is open.** Four numbered rulings are closed — the `editable: false` ruling, **18** (default `'anywhere'`, grill 2026-09-10), **19**, and **23**. Q16 closed 2026-09-10 (grill): `dataset.setFieldEditable`.

**Nothing blocks on this ADR.** It changes the default posture of a public door, which is why it deserves its own decision rather than a bullet inside a storage rename.

## Why it does not gate the storage rename

`#mergeCoreFieldOverride` merges **`editable` only** and never reads `source` (`field-registry.ts:101-225`), so [0011](../0011-consumer-values-in-props/README.md) deletes `FieldSource` cleanly around it ([the pairwise check](../README.md#where-the-decisions-could-walk-over-each-other-and-why-they-do-not)).

## This ADR owns the resolver's `editable` arm, and only that arm

**This ADR fills the editable arm and wires `entries.update()` to it** — the last of the three ([the whole story](../README.md#the-write-resolver-one-function-three-owners)). `view/capability.ts:120` is the one place in `src/` that reads `Field.editable` today, so the arm has exactly one existing behaviour to change. **Claim I14 when this ADR lands, not after 0013.**

## An API gap this ADR does not serialize

**Recorded here 2026-09-10.** It was in the [0015 spike review](../reviews/2026-09-10-0015-write-door-spikes/README.md) as trap 12.

`FieldRegistry.authored` filtered core Field keys for the Document. A consumer's `{ key: 'end', editable: false }` merges into the core Field at construction (`#mergeCoreFieldOverride` writes `#resolved`), so **`dataset.fields.all` already reads it back.** `authored` never did. [ADR 0016](../../../docs/adr/0016-the-library-holds-no-save-format.md) deletes `authored` with the Document.

**`harness/data.ts:39-40` states the lock rides in the Document.** That comment goes with build 0016's B5. Do not encode a Document here. Assert `fields.all`.

## Decision 18's cost table is two rows

18 lists structural calls that would start throwing. **[0013](../0013-what-decides-derivation/README.md) deleted `kind`**, so `update(id, { kind })` does not exist. Argue 18 against `parentId` and `segments` only.

---

# Open decisions

**None.** Q16 closed 2026-09-10 (grill) and is below with 18.

---

# Closed decisions

## 18 — `editable` is `'never' | 'api' | 'anywhere'`; default `'anywhere'`

**Closed 2026-09-10. Default overruled 2026-09-10 (grill).** Was held: a boolean that means three things, one of them absence, is not wanted. The enum is the shape that is not that boolean.

**The ruling.** One key, three named states. `true` aliases `'anywhere'`. `false` aliases `'never'`. Absent means `'anywhere'`. `'api'` is an opt-out: grid dead, `update()` allowed. Do not special-case “has `column`”.

```ts
fields: [
  { key: 'cost' },                         // cell, handle, and update() — default 'anywhere'
  { key: 'owner', editable: 'api' },       // update() only
  { key: 'start', editable: 'never' },     // lock — or editable: false
]
```

After ingest the stored Field holds the enum. Boolean aliases are input-only, the same way `InstantInput` is.

**Two thresholds, one key.** The grid (`canWrite`, cells, handles) is writable iff `'anywhere'`. `entries.update()` is writable iff not `'never'` — so `'api'` and `'anywhere'`. `canWrite` does **not** gain a door argument. Gestures keep asking the grid threshold. `update()` asks the API threshold. The consumer still states it once on the Field.

Create, ingest, and History replay still write a locked Field (decision 19). Un-date is a change, so `'never'` on `start` throws `FieldNotEditableError`.

**Default `'anywhere'` is the grill 2026-09-10 ruling.** A cost column is editable until you lock it. A script can still `update({ cost })`. Set `'api'` when the grid must stay dead. Bars still drag because core `name` / `start` / `end` declare `'anywhere'` (today `editable: true`). `parentId` / `segments` have no column.

**After setup (grill 2026-09-10).** No new Field keys. Hide/show columns stay live. Only `editable` may change on a Field. Keep `CORE_FIELD_OVERRIDABLE_KEYS`. Fields are the schema. The call site is Q16, closed below.

**I14.** Gestures ask `canWrite` — the grid threshold. `update()` asks the same key against the API threshold. The locked sentence *"one answer gates every writer, default false"* is rewritten in the [prose sweep](../shared/prose-sweep.md). Enforcement at the data door is a new `entries.update()` assertion in `e2e/write-refusal.spec.ts`.

**The four locked sentences** (`plans/02` §4.2, `plans/01` §2.6, `plans/01` I14, `src/model/field.ts:125-127`) all change. The specs already say `'anywhere'`. This ADR rewrites the `field.ts` comment with the code.

**No schema number.** [ADR 0016](../../../docs/adr/0016-the-library-holds-no-save-format.md) deleted the Document. Do not encode `SerializedField`. `{ key: 'start', editable: false }` constructs and stores as `'never'`. `dataset.fields.all` already reads the merge.

**What lost.** Copying the view rule (default refuse at `update()`). Split as a three-way boolean. A second word (`acceptsUpdate`). Two keys (`locked` plus `editable`). A door argument on `canWrite`.

**The four locked sentences** (`plans/02:477`, `plans/01:283`, `plans/01:926`, `src/model/field.ts:125-127`) all change. They currently pick copy. This ruling edits them on purpose.

## Q16 — live `editable` is `setFieldEditable`

**Closed 2026-09-10 (grill).** Was: *(a) `dataset.setFieldEditable('start', 'never')`; (b) re-apply the declaration; (c) a second `dataset.editable` map.* AG Grid's full-list assign is survey, not the call.

**The ruling is (a).** A verb writes one key — `plans/02` §2, #184 / #195 — the same family as `gantt.hideGridColumn('cost')`. `editable` stays on the Field. The live door does not restate the schema.

```ts
dataset.setFieldEditable('start', 'never')
gantt.hideGridColumn('cost')
```

`dataset.setFieldEditable('start', 'never')` reads "set Field start editable to never." `true` / `false` still alias `'anywhere'` / `'never'`. Per-row stays `interactions.edit`.

**Why not mutate `dataset.field('start').editable`.** That object is a resolved snapshot, not a signal. Signals track Entry values in the store. Config is a value (#187): readers cache `FieldRegistry.all` by array identity, and a property poke does not change that identity, so nothing invalidates. The verb reads the current Field, copies it with the new `editable`, and replaces the array identity so subscribers notice.

**What lost.** Re-assigning the full Field list (looks like adding schema; AG Grid's door, not ours). A second `editable` map. `fields.override` / `fields.configure` for one key.

---

## The `editable` ruling — `editable: false` refuses `entries.update()`

**Closed 2026-09-09. Ruled by the author.** It was never a numbered decision. It sat in the ADR as an aside — *"one thing to check before the deletion lands"*.

**The finding.** The two doors differ, and it is verified: `Field.editable` is read at exactly one place in `src/`, `view/capability.ts:120`, and nothing in `data/` consults it. So a Field a consumer declared unwritable is writable through `entries.update()` today.

**The ruling.** `editable: false` refuses the change at both doors. [0011](../0011-consumer-values-in-props/README.md) already moved the function into `data/`. This ADR fills the editable arm and wires `entries.update()` to it, and `view/capability.ts` keeps calling the same function rather than restating it. New error: `FieldNotEditableError`, declared and thrown here.

**Why it matters beyond the one gate.** [0013](../0013-what-decides-derivation/README.md) refuses a *derived* write at `entries.update()`. Leaving the `editable` half split would give the library two answers to *"may this value change"* at two doors — the exact split I14 exists to close. **Claim I14 when this ADR lands, and only for the half this ADR owns.** Decision 18 closed: `'never'` refuses both doors; `'api'` refuses the grid and allows `update()`.

**What it opened.** Decision **18**, closed 2026-09-10 on the enum. Decisions **19** and **23** closed the same day on the override.

## 19 — keep `{ key: 'start', editable: false }`, and serialize it

**Closed 2026-09-10. Ruled by the author.** Was: *what replaces `{ key: 'start', editable: false }` at the data door?*

**The ruling. Keep the override for `editable` alone.** `{ key: 'start', editable: false }` constructs. Create, ingest, and History replay still write. `update()` and the grid refuse **change**. Un-date is a change, so it throws `FieldNotEditableError`.

**Do not serialize the override.** `FieldRegistry.authored` dropped core keys because it fed the Document. `#mergeCoreFieldOverride` already writes the merge into `#resolved`, so `dataset.fields.all` reads it. [ADR 0016](../../../docs/adr/0016-the-library-holds-no-save-format.md) deletes `authored`. Assert `fields.all`. Do not tidy a harness comment about a Document; build 0016 deletes that feature.

**`beforeChange` does not replace this.** `fieldRowsOf` filters `updated`, so it never sees `add`. The event cannot lock a create.

**What lost.** A Dataset-level `readOnlyFields` (second name for `editable`). Accepting the loss (no way to lock `start` on the Dataset).

## 23 — three declaration shapes

**Closed 2026-09-10. Ruled by the author.** Decision 19 kept the override, so this is already answered by it.

**Three shapes.** `{ key: 'start', editable: false }` constructs (the lock). `{ key: 'start' }` is a no-op. `{ key: 'start', column }` throws `IllegalCoreFieldOverrideError`. Extra keys on a core name throw. The lock is the one override we keep.

A `props` *value* naming a core key stays a warning ([0011](../0011-consumer-values-in-props/README.md)). This ruling is the *declaration* half.

---

# The work

## The build — the editable arm and the enum

- Widen `Field.editable` to `'never' | 'api' | 'anywhere' | boolean`. After ingest the stored Field holds the enum. `true` → `'anywhere'`, `false` → `'never'`, absent → `'anywhere'`.
- Core `name` / `start` / `end` declare `'anywhere'` (today `editable: true`). `parentId` and `segments` have no column.
- Fill the resolver's editable arm. Grid / `canWrite`: writable iff `'anywhere'`. `entries.update()`: refuse `'never'` with `FieldNotEditableError`. Do not add a door argument to `canWrite`.
- Check `compute` before `editable` ([the ruling](../shared/rulings.md#computedfieldcannotbewrittenerror--one-name-at-two-doors)).
- **Do not encode a Document.** [ADR 0016](../../../docs/adr/0016-the-library-holds-no-save-format.md) deleted `SerializedField`. `{ key: 'start', editable: false }` constructs and stores as `'never'`. Assert `dataset.fields.all` reads it.
- `e2e/write-refusal.spec.ts` gains an `entries.update()` assertion for `'never'` and for `'api'` on a consumer Field.
- `view/capability.ts:120` currently reads `field.editable === true`. Point it at the moved resolver. Do not restate the enum there.
- Live `editable` after construction: `dataset.setFieldEditable(key, editable)` (Q16). Copy that Field; replace `FieldRegistry.all`'s identity (#187). Do not mutate `field()` in place. Do not accept new Field keys. Do not assign `dataset.fields`.



