# Proposed API after ADR 0011

**Governing:** [`docs/adr/0011-…`](../../docs/adr/0011-consumer-values-live-in-props-and-a-derived-value-never-persists.md).
**Work plan:** [`README.md`](README.md).
Open decisions live only in the ADR’s [Blocking decisions](../../docs/adr/0011-consumer-values-live-in-props-and-a-derived-value-never-persists.md#blocking-decisions). The namespace is `props` — decision **17**, closed. Closed decisions live in [`closed-decisions.md`](closed-decisions.md).

Nothing here is implemented. Decisions **9**, **12**, **18** and **19** gate group A. **9 and 12 are one decision** — 9's case for sharing `props` rests on a typed dot access that 12's prefix removes.

---

## Dataset

```ts
new Dataset<ConsumerEntryProps>({ timeZone, entries, fields, plugins })
Dataset.fromJSON<ConsumerEntryProps>(json, { fields, plugins })
dataset.toJSON()
```

One generic types `entry.props` and the `props` patch.

**Issue.** A plugin’s keys are not in `TProps`. Decision **9** chooses whether they share `entry.props` (augmentation + a plugin prefix) or live in the plugin store. The store option must refuse `update({ props: { progress } })`, or that call writes the consumer bag while the grid reads the plugin store.

**Issue.** Option A was probed for reads and never for writes. `PropsEdit<TProps>` maps `keyof TProps`, and a plugin key is not there — so `update(id, { props: { progress: 60 } })` does not type-check, and the cell editor writes plugin Fields. A needs `PropsEdit<TProps & PluginEntryProps>`, which puts back the intersection *one generic* removed.

Also one generic on the published plugin types: `DatasetOptions`, `DatasetPlugin`, `DatasetPluginContext`, `Dataset.fromJSON`.

---

## Entry

```ts
entry.props.owner          // stored consumer values. Always present; `{}` when empty.
entry.start / entry.end   // optional on every kind
```

An Entry has dates if and only if it holds at least one Segment. No dates draws no bar. The grid row still shows.

```ts
add({ id, name })                                          // no dates, no Segments
add({ id, name, start, end })                              // mints one Segment
add({ id, name, segments: [{ start, end }] })              // envelope derived
update(id, { start: undefined, end: undefined })           // un-dates; clears Segments
add({ id, name, start })                                   // InvalidInstantError
update(id, { segments: [] })                               // EmptySegmentsError
```

**Issue.** A dateless row cannot be dated through the default UI: no bar, and default `gridColumns` is `['name']`. Dating from the timeline is a later gesture.

---

## Field declaration

```ts
{ key: 'owner', column: { header: 'Own' } }
{ key: 'progress', type: 'percent', rollUp: 'weightedMeanByDuration', editable: true }
{ key: 'ref', compute: (entry, ctx) => rowNumber(entry.id) }
```

The key is the address. `{ key: 'owner' }` is `entry.props.owner`. `{ key: 'start' }` is `entry.start`. No `source`. Declare a Field when the library has a job (type, rollup, column, editor). A computed Field cannot roll up or be edited.

```ts
{ key: 'ref', compute: (e) => 1, rollUp: 'sum' }    // ComputedFieldCannotBeWrittenError
{ key: 'start', editable: false }                   // DuplicateFieldKeyError — core override is gone
{ key: 'props' }                                     // type-checks; throws at runtime
```

`gantt.interactions.edit` stays the per-entry affordance override. It does **not** replace core-key editability at the data door — see decision **19**.

**Issue.** `{ key: 'props' }` cannot be a type error without closing `FieldKey` and refusing consumer strings. Keep the runtime throw.

`editable: false` refuses **both** doors — ruled 2026-09-09. `entries.update()` throws `FieldNotEditableError`, and one resolver in `data/` answers for the cell editor and the drags too.

**Issue.** What an *absent* `editable` does at `entries.update()` is decision **18**. Copying the view rule (`=== true`) closes the write door by default.

**Issue.** `interactions.edit` is view-level, so it can no longer replace the deleted `{ key: 'start', editable: false }`. What does is decision **19**.

**Issue.** Decision **12** may require a plugin prefix on plugin Field keys. That changes `gridColumns` and every by-key call for those Fields.

---

## Read

```ts
entry.props.owner                         // the stored bag, typed by TProps
dataset.entries.fieldValue(id, 'owner')  // any Field key: core, compute, plugin
dataset.entries.fieldValue(id, 'start')  // Instant
dataset.entries.fieldValue(id, 'ref')          // compute / plugin: unknown
```

Two doors, two questions. `entry.props` is storage. `fieldValue` resolves getters and aggregates.

**Four doors, counting the plugin surface:** `entry.props.k`, `fieldValue(id, k)`, `ctx.read(entry, k)`, `ctx.durationOf(entry)`. Decision **13** covers all four.

**Issue.** `fieldValue` and `FieldContext.read` are one job under two names (decision **13**).

**Issue.** A compute Field’s answer stays `unknown` (#267). `TValue` on `Field` never comes back from the registry.

**Issue.** *An earlier draft published `fieldValue<number>(id, 'ref')` and it cannot compile.* The signature is `fieldValue<K extends FieldKey>(id, field: K)` (`model/dataset.ts:41`), so `number` does not satisfy the one type parameter. Adding a `TValue` parameter needs partial inference — name `TValue`, infer `K` — which TypeScript does not do. That is the same trap decision **9** cites against a plugin type parameter (#123). The AG Grid `getCellValue<TValue>` analogy does not carry, because their key is not a type parameter. **A caller who knows the type narrows the result; the library publishes no type argument here** unless someone finds a signature that infers.

---

## Write

```ts
update(id, { start, props: { owner: 'Sam' } })   // props merges; other props keys kept
update(id, { props: { owner: undefined } })      // that key leaves the record
add({ id, name, props: { owner: 'Ali' } })       // a record, not a patch
update(id, { strat: '…' })                      // UnknownFieldError — top level is the schema
```

`PropsEdit<TProps>` is the patch: every key optional, every key removable. `EntryEdit` may remove only what a stored Entry may lack — `parentId`, `start`, `end` **after group D**. Types live in the ADR.

**Issue.** `start` and `end` are required on `Entry` at HEAD, so the un-date verb does not compile between group A and group D.

**Issue.** `plans/02` ships `update(id, { start, cost })`. Nested `props:` drops that shorthand (decision **11**). A flat spelling for *declared* keys only is still open, and it would make a write’s legality depend on registration.

**Issue.** Whether `update({ props: { phase: 3 } })` on an undeclared key succeeds is decision **1**. The ADR now recommends it throw. Group B’s extra ChangeSet work exists only if it succeeds. Round-trip of undeclared keys at ingest stays either way.

---

## Derived values

```ts
update('phase-1', { props: { cost: 999 } })                 // DerivedFieldNotWritableError
update('phase-1', { start, props: { cost: 999 } })          // refused whole
add({ id, kind: 'group', props: { cost: 500 } })            // succeeds; cost dropped; one warning
```

`toJSON()` omits a rolling-up parent’s rolling-up keys. AutoGroup conversion is a door in **both** directions, and a caller sees `kind` change under them: a dated parent that gains a child starts deriving those dates in that commit, and one that loses its last child converts back. What it converts back **to** is decision **8**.

**Issue.** A plugin cascade writing a derived cell is exempt from the throw and then overwritten (decision **5**). Answer before group C, which deletes the code the answer depends on.

---

## Plugin

```ts
ctx.fields.register({ key: 'progress', type: 'percent', rollUp: '…' })
const extender: EditExtender = (request) =>
  new Map([[phaseId, { start: moved.start, props: { risk: 'high' } }]])
```

Registration still closes when `setup()` returns. Plugin declarations stay out of the Document.

`EditRequest.proposed` is a complete `ProposedEdit` (today `StoredEdit`). `props` is **required** on it. `durationOf(entry)` returns `Duration | undefined`.

**Issue.** A complete record and a patch are now the same shape, so `model/entry.ts:98`'s stated asymmetry — *every `StoredEdit` is a legal `EntryEdit`, and the reverse is not* — stops holding at `props`. A plugin that spreads `proposed.props` into a returned edit proposes **every** key, derived ones included.

**Issue.** The extender returns `new Map()`, brands ids, and the author writes composition (decision **16**). Comparable runtimes return a value or nothing and merge themselves.

The published `compute` sample writes `duration.value / MS.DAY`. `MS` is public (`api/index.ts:365`, `time/instant.ts:45`) and the library uses it itself at `core-fields.ts:46`. Never publish the raw constant — decision **15**, closed 2026-09-09.

---

## Document — schema 5

```jsonc
{
  "schema": 5,
  "entries": [
    { "id": "phase-1", "kind": "group", "name": "Mobilise" },
    { "id": "t1", "parentId": "phase-1", "name": "Survey",
      "start": "2026-01-05", "end": "2026-01-09",
      "props": { "owner": "Jo", "phase": 2 } }
  ],
  "fields": [ /* consumer-authored only; no `source` */ ]
}
```

`meta` becomes `props`. Dates are optional. Derived keys are omitted. Unknown keys inside `props` round-trip. Unknown top-level keys stay unknown.

**Issue.** The Document key *is* the namespace name (decision **17**). Decide it, and decision **12**’s marker, before schema 5 is written.

---

## `rollUpKinds`

```ts
dataset.rollUpKinds = ['group', 'milestone']
```

Flipping a kind *out* keeps the last derived answer, now authored.

**Issue.** Flipping a kind *in* either drops authored values and clears undo, or throws `RollUpKindsWouldDropValuesError` (decision **6**). The ADR as drafted destroys. The recommendation is to refuse. The larger question is whether a per-entry flag should replace the kind set.

---

## Renames and deletions

| Today | After |
|---|---|
| `Entry.meta` | `Entry.props` |
| `TMeta` + `TFields` | `TProps` |
| `StoredEdit` / `toStoredEdit` | `ProposedEdit` / `toProposedEdit` |
| `Entry.meta` bag generic `TMeta` | `TProps`; `DataEdit` never shipped — it is `PropsEdit` |

**Deleted:** `FieldSource`, `Field.source`, the `meta` core Field, `DuplicateFieldSourceError`, `InvalidFieldSourceError`, `CORE_FIELD_OVERRIDABLE_KEYS`, `reportCorrectedRollUps`.

**New errors:** `DerivedFieldNotWritableError`, `ComputedFieldCannotBeWrittenError`, `FieldNotEditableError`. Conditional: `RollUpKindsWouldDropValuesError` (decision **6** refuse), `PluginFieldNotInDataError` (decision **9** store).

`UnknownFieldError` stays at the top level of an edit. `fieldValue` stops throwing it only if decision **1** lets undeclared keys into the ChangeSet.
