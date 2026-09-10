# ADR 0015 — what the write door refuses

**The decision:** [`docs/adr/0015-…`](../../../docs/adr/0015-what-the-write-door-refuses.md)

How strict is `entries.update()`? What does an *absent* `editable` mean there, what replaces the deleted core-key override, and does a consumer declaration on a core key throw?

## Where it stands

**No decision is open.** Four are closed — the `editable: false` ruling, **18**, **19**, and **23**. 18 closed on 2026-09-10: `editable` is `'never' | 'api' | 'anywhere'`, default `'api'`.

**Nothing blocks on this ADR.** It changes the default posture of a public door, which is why it deserves its own decision rather than a bullet inside a storage rename.

## Why it does not gate the storage rename

`#mergeCoreFieldOverride` merges **`editable` only** and never reads `source` (`field-registry.ts:101-225`), so [0011](../0011-consumer-values-in-props/README.md) deletes `FieldSource` cleanly around it ([the pairwise check](../README.md#where-the-decisions-could-walk-over-each-other-and-why-they-do-not)).

## This ADR owns the resolver's `editable` arm, and only that arm

**This ADR fills the editable arm and wires `entries.update()` to it** — the last of the three ([the whole story](../README.md#the-write-resolver-one-function-three-owners)). `view/capability.ts:120` is the one place in `src/` that reads `Field.editable` today, so the arm has exactly one existing behaviour to change. **Claim I14 when this ADR lands, not after 0013.**

## An API gap this ADR owns: a core override never reaches the Document

**Recorded here 2026-09-10.** It was in the [0015 spike review](../reviews/2026-09-10-0015-write-door-spikes/README.md) as trap 12 and in the combined review's HEAD traps, and in no ADR.

`FieldRegistry.authored` filters core Field keys (`field-registry.ts:150-152`), and `encodeDeclaredField` drops them too. A consumer's `{ key: 'end', editable: false }` merges into the core Field at construction and then **never serializes**. `cost.editable` round-trips; `end.editable` does not. `fromJSON` is ingest, so the lock only survives if the caller passes `fields` again.

**`harness/data.ts:39-40` states the opposite, and it is live today:** *"The lock rides in the Document too. `editable` serializes on the Field, so an exported Document carries it and an import puts it back."* The call it describes is `{ key: 'end', editable: false }` at `:45`.

**This ADR closes it by serializing the override.** Decision 19, closed 2026-09-10, keeps `{ key: 'start', editable: false }` and writes it into the Document. Do not tidy the harness comment; close the library.

## Decision 18's cost table is two rows

18 lists structural calls that would start throwing. **[0013](../0013-what-decides-derivation/README.md) deleted `kind`**, so `update(id, { kind })` does not exist. Argue 18 against `parentId` and `segments` only.

---

# Open decisions

**None.** 18 closed on 2026-09-10 and is below with 19 and 23.

---

# Closed decisions

## 18 — `editable` is `'never' | 'api' | 'anywhere'`; default `'api'`

**Closed 2026-09-10. Ruled by the author.** Was held: a boolean that means three things, one of them absence, is not wanted. The enum is the shape that is not that boolean.

**The ruling.** One key, three named states. `true` aliases `'anywhere'`. `false` aliases `'never'`. Absent means `'api'`.

```ts
fields: [
  { key: 'cost', editable: 'anywhere' },   // cell, handle, and update()
  { key: 'owner' },                        // update() only — default 'api'
  { key: 'parentId' },                     // update() only — no column
  { key: 'start', editable: 'never' },     // lock — or editable: false
]
```

After ingest the stored Field holds the enum. Boolean aliases are input-only, the same way `InstantInput` is.

**Two thresholds, one key.** The grid (`canWrite`, cells, handles) is writable iff `'anywhere'`. `entries.update()` is writable iff not `'never'` — so `'api'` and `'anywhere'`. `canWrite` does **not** gain a door argument. Gestures keep asking the grid threshold. `update()` asks the API threshold. The consumer still states it once on the Field.

Create, ingest, and History replay still write a locked Field (decision 19). Un-date is a change, so `'never'` on `start` throws `FieldNotEditableError`.

**Default `'api'` is split's behaviour, named.** `parentId` and `segments` keep working. A cost column stays read-only until `'anywhere'`. A script can `update({ cost })` without opting the Field into the grid. Bars still drag because core `name` / `start` / `end` declare `'anywhere'` (today `editable: true`).

**I14.** Gestures ask `canWrite` — the grid threshold. `update()` asks the same key against the API threshold. The locked sentence *"one answer gates every writer, default false"* is rewritten in the [prose sweep](../shared/prose-sweep.md). Enforcement at the data door is a new `entries.update()` assertion in `e2e/write-refusal.spec.ts`.

**This ADR writes schema 9** — `SerializedField.editable` becomes the enum ([the counter](../shared/rulings.md#3--the-schema-restarts-release-gate)). Omit when the value is the default `'api'`. `false` at the write door normalizes to `'never'` before encode, so `{ key: 'start', editable: false }` round-trips as `"editable": "never"`. Spend the next unused number at merge if 0014 has not yet spent 8.

**What lost.** Copying the view rule (default refuse at `update()`). Split as a three-way boolean. A second word (`acceptsUpdate`). Two keys (`locked` plus `editable`). A door argument on `canWrite`.

**The four locked sentences** (`plans/02:477`, `plans/01:283`, `plans/01:926`, `src/model/field.ts:125-127`) all change. They currently pick copy. This ruling edits them on purpose.

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

**Serialize the override.** `FieldRegistry.authored` currently drops core keys, so the lock does not round-trip. This ruling closes that gap. Decision 18: a core `editable: false` normalizes to `'never'` and rides in the Document as `"editable": "never"`. Do not tidy the harness comment; close the library. `fromJSON` is ingest, so without encoding, the lock only survived if the caller passed `fields` again.

**`beforeChange` does not replace this.** `fieldRowsOf` filters `updated`, so it never sees `add`. The event cannot lock a create.

**What lost.** A Dataset-level `readOnlyFields` (second name for `editable`). Accepting the loss (no way to lock `start` on the Dataset).

## 23 — three declaration shapes

**Closed 2026-09-10. Ruled by the author.** Decision 19 kept the override, so this is already answered by it.

**Three shapes.** `{ key: 'start', editable: false }` constructs (the lock). `{ key: 'start' }` is a no-op. `{ key: 'start', column }` throws `IllegalCoreFieldOverrideError`. Extra keys on a core name throw. The lock is the one override we keep.

A `props` *value* naming a core key stays a warning ([0011](../0011-consumer-values-in-props/README.md)). This ruling is the *declaration* half.

---

# The work

## The build — the editable arm and the enum

- Widen `Field.editable` to `'never' | 'api' | 'anywhere' | boolean`. After ingest the stored Field holds the enum. `true` → `'anywhere'`, `false` → `'never'`, absent → `'api'`.
- Core `name` / `start` / `end` declare `'anywhere'` (today `editable: true`). `parentId` and `segments` stay default `'api'`.
- Fill the resolver's editable arm. Grid / `canWrite`: writable iff `'anywhere'`. `entries.update()`: refuse `'never'` with `FieldNotEditableError`. Do not add a door argument to `canWrite`.
- Check `compute` before `editable` ([the ruling](../shared/rulings.md#computedfieldcannotbewrittenerror--one-name-at-two-doors)).
- Encode the enum on `SerializedField`. Omit `'api'`. Write schema **9**. `{ key: 'start', editable: false }` round-trips as `"editable": "never"`.
- `e2e/write-refusal.spec.ts` gains an `entries.update()` assertion for `'never'` and for default `'api'` on `parentId`.
- `view/capability.ts:120` currently reads `field.editable === true`. Point it at the moved resolver. Do not restate the enum there.



