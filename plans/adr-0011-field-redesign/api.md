# Proposed API after ADR 0011

**Governing:** [`docs/adr/0011-…`](../../docs/adr/0011-consumer-values-live-in-data-and-a-derived-value-never-persists.md).
**Work plan:** [`README.md`](README.md).
Open decisions live only in the ADR’s [Blocking decisions](../../docs/adr/0011-consumer-values-live-in-data-and-a-derived-value-never-persists.md#blocking-decisions). This file writes `data` because the draft needs one word.

Nothing here is implemented. Decision **9** gates group A.

---

## Dataset

```ts
new Dataset<ConsumerEntryData>({ timeZone, entries, fields, plugins })
Dataset.fromJSON<ConsumerEntryData>(json, { fields, plugins })
dataset.toJSON()
```

One generic types `entry.data` and the `data` patch.

**Issue.** A plugin’s keys are not in `TData`. Decision **9** chooses whether they share `entry.data` (augmentation + a plugin prefix) or live in the plugin store. The store option must refuse `update({ data: { progress } })`, or that call writes the consumer bag while the grid reads the plugin store.

Also one generic on the published plugin types: `DatasetOptions`, `DatasetPlugin`, `DatasetPluginContext`, `Dataset.fromJSON`.

---

## Entry

```ts
entry.data.owner          // stored consumer values. Always present; `{}` when empty.
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

The key is the address. `{ key: 'owner' }` is `entry.data.owner`. `{ key: 'start' }` is `entry.start`. No `source`. Declare a Field when the library has a job (type, rollup, column, editor). A computed Field cannot roll up or be edited.

```ts
{ key: 'ref', compute: (e) => 1, rollUp: 'sum' }    // ComputedFieldCannotBeWrittenError
{ key: 'start', editable: false }                   // DuplicateFieldKeyError — core override is gone
{ key: 'data' }                                     // type-checks; throws at runtime
```

Core-key editability moves to `gantt.interactions.edit`.

**Issue.** `{ key: 'data' }` cannot be a type error without closing `FieldKey` and refusing consumer strings. Keep the runtime throw.

**Issue.** Check before the core override goes: does `Field.editable: false` also refuse `entries.update()`? `interactions.edit` gates the cell and the drags only (#256).

**Issue.** Decision **12** may require a plugin prefix on plugin Field keys. That changes `gridColumns` and every by-key call for those Fields.

---

## Read

```ts
entry.data.owner                         // the stored bag, typed by TData
dataset.entries.fieldValue(id, 'owner')  // any Field key: core, compute, plugin
dataset.entries.fieldValue(id, 'start')  // Instant
dataset.entries.fieldValue<number>(id, 'ref')  // compute / plugin: unknown unless named
```

Two doors, two questions. `entry.data` is storage. `fieldValue` resolves getters and aggregates.

**Issue.** `fieldValue` and `FieldContext.read` are one job under two names (decision **13**).

**Issue.** A compute Field’s answer stays `unknown` (#267). `TValue` on `Field` never comes back from the registry.

---

## Write

```ts
update(id, { start, data: { owner: 'Sam' } })   // data merges; other data keys kept
update(id, { data: { owner: undefined } })      // that key leaves the record
add({ id, name, data: { owner: 'Ali' } })       // a record, not a patch
update(id, { strat: '…' })                      // UnknownFieldError — top level is the schema
```

`DataEdit<TData>` is the patch: every key optional, every key removable. `EntryEdit` may remove only `parentId`, `start`, and `end`. Types live in the ADR.

**Issue.** `plans/02` ships `update(id, { start, cost })`. Nested `data:` drops that shorthand (decision **11**). A flat spelling for *declared* keys only is still open, and it would make a write’s legality depend on registration.

**Issue.** Whether `update({ data: { phase: 3 } })` on an undeclared key succeeds is decision **1**. The ADR now recommends it throw. Group B’s extra ChangeSet work exists only if it succeeds. Round-trip of undeclared keys at ingest stays either way.

---

## Derived values

```ts
update('phase-1', { data: { cost: 999 } })                 // DerivedFieldNotWritableError
update('phase-1', { start, data: { cost: 999 } })          // refused whole
add({ id, kind: 'group', data: { cost: 500 } })            // succeeds; cost dropped; one warning
```

`toJSON()` omits a rolling-up parent’s rolling-up keys. AutoGroup promotion is a door: a dated parent that gains a child starts deriving those dates in that commit.

**Issue.** A plugin cascade writing a derived cell is exempt from the throw and then overwritten (decision **5**). Answer before group C, which deletes the code the answer depends on.

---

## Plugin

```ts
ctx.fields.register({ key: 'progress', type: 'percent', rollUp: '…' })
const extender: EditExtender = (request) =>
  new Map([[phaseId, { start: moved.start, data: { risk: 'high' } }]])
```

Registration still closes when `setup()` returns. Plugin declarations stay out of the Document.

`EditRequest.proposed` is a complete `ProposedEdit` (today `StoredEdit`). `durationOf(entry)` returns `Duration | undefined`.

**Issue.** The extender returns `new Map()`, brands ids, and the author writes composition (decision **16**). Comparable runtimes return a value or nothing and merge themselves.

**Issue.** The published `compute` sample divides `duration.value` by `86_400_000`. I10 forbids that in `src/` (decision **15**).

---

## Document — schema 5

```jsonc
{
  "schema": 5,
  "entries": [
    { "id": "phase-1", "kind": "group", "name": "Mobilise" },
    { "id": "t1", "parentId": "phase-1", "name": "Survey",
      "start": "2026-01-05", "end": "2026-01-09",
      "data": { "owner": "Jo", "phase": 2 } }
  ],
  "fields": [ /* consumer-authored only; no `source` */ ]
}
```

`meta` becomes `data`. Dates are optional. Derived keys are omitted. Unknown keys inside `data` round-trip. Unknown top-level keys stay unknown.

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
| `Entry.meta` | `Entry.data` |
| `TMeta` + `TFields` | `TData` |
| `StoredEdit` / `toStoredEdit` | `ProposedEdit` / `toProposedEdit` |

**Deleted:** `FieldSource`, `Field.source`, the `meta` core Field, `DuplicateFieldSourceError`, `InvalidFieldSourceError`, `CORE_FIELD_OVERRIDABLE_KEYS`, `reportCorrectedRollUps`.

**New errors:** `DerivedFieldNotWritableError`, `ComputedFieldCannotBeWrittenError`. Conditional: `RollUpKindsWouldDropValuesError` (decision **6** refuse), `PluginFieldNotInDataError` (decision **9** store).

`UnknownFieldError` stays at the top level of an edit. `fieldValue` stops throwing it only if decision **1** lets undeclared keys into the ChangeSet.
