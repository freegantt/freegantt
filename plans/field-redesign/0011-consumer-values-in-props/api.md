# The call sites after ADR 0011

**Governing:** [ADR 0011](../../../docs/adr/0011-consumer-values-live-in-props.md). The types behind these calls are in [`types.md`](types.md); the open questions are in [0011 open decisions](README.md#open-decisions).

**Nothing here is implemented.** This file shows the call sites after all five ADRs, so a reader sees one picture. **Implement only the 0011 rows.** A ⚠️ names the ADR that still owns that line.

## What this ADR changes

| | today (after 0012) | after this ADR |
|---|---|---|
| Stored Entry | `meta?: TMeta` | `props: Readonly<Partial<TProps>>`, always present (`{}` when absent) |
| `EntryEdit` | `meta?: TMeta`, **replaces** | `props?: PropsEdit<TProps>`, **merges** |
| Field address | `source: FieldSource` | the Field key, or `compute` |
| Generics | `Dataset<TMeta, TFields>` | `Dataset<TProps>` |
| Schema | **5** — 0012 already wrote optional dates | **6** — `meta` → `props`, `source` leaves `SerializedField` |

`start` / `end` are already optional. The un-date verb is [0012](../0012-optional-dates/README.md)'s. `EntryEdit` follows `Entry`, so `{ start: undefined }` compiles here.

A rolling-up parent's derived keys still reach the Document. [0013](../0013-what-decides-derivation/README.md) omits them and writes schema **7**. `CORE_FIELD_OVERRIDABLE_KEYS` stays until [0015](../0015-write-door/README.md) decision 19.

## The whole shape, in one block

```ts
interface ConsumerEntryProps {
  owner?: string;
  progress?: number;
  phase?: number;
}

const dataset = new Dataset<ConsumerEntryProps>({
  timeZone: 'UTC',
  entries: [
    { id: 'phase-1', kind: 'group', name: 'Mobilise' },   // no dates, draws no bar
    { id: 't1', parentId: 'phase-1', name: 'Survey',
      start: '2026-01-05', end: '2026-01-09',
      props: { owner: 'Jo', progress: 40, phase: 2 } },
  ],
  fields: [
    { key: 'owner', column: { header: 'Own', align: 'center' } },
    { key: 'progress', type: 'percent', rollUp: 'weightedMeanByDuration', editable: true },
    { key: 'ref', compute: (entry) => rowNumber(entry.id) },
  ],
});

dataset.entries.get('t1')?.props.owner
dataset.entries.fieldValue('t1', 'owner')
dataset.entries.update('t1', { start: '2026-01-06', props: { owner: 'Sam' } })  // merges
```

## Dataset

```ts
new Dataset<ConsumerEntryProps>({ timeZone, entries, fields, plugins })
Dataset.fromJSON<ConsumerEntryProps>(json, { fields, plugins })
dataset.toJSON()
```

One generic types `entry.props` and the `props` patch. The published plugin types lose their second parameter too: `DatasetOptions`, `DatasetPlugin`, `DatasetPluginContext`, `Dataset.fromJSON`.

⚠️ **A plugin's keys are not in `TProps`** — decision 9. If plugin values share `entry.props`, the write door needs `PropsEdit<TProps & PluginEntryProps>` or the cell editor cannot write a plugin Field. If they live in the plugin store, `update({ props: { progress } })` must be refused, or that call writes the consumer bag while the grid reads the store.

## Entry

```ts
entry.props.owner         // stored consumer values. Always present; `{}` when empty.
entry.start / entry.end   // optional on every kind
```

An Entry has dates if and only if it holds at least one Segment. No dates draws no bar. The grid row still shows. ⚠️ These calls are [0012](../0012-optional-dates/README.md)'s. They are already true when this ADR builds.

```ts
add({ id, name })                                 // no dates, no Segments
add({ id, name, start, end })                     // mints one Segment
add({ id, name, segments: [{ start, end }] })     // envelope derived
update(id, { start: undefined, end: undefined })  // un-dates; clears Segments
add({ id, name, start })                          // InvalidInstantError
update(id, { segments: [] })                      // EmptySegmentsError
```

**A known hole:** a dateless row cannot be dated through the default UI. It draws no bar, and the default `gridColumns` is `['name']`. Dating from the timeline is a later gesture.

## Field declaration

```ts
{ key: 'owner', column: { header: 'Own' } }
{ key: 'progress', type: 'percent', rollUp: 'weightedMeanByDuration', editable: true }
{ key: 'ref', compute: (entry, ctx) => rowNumber(entry.id) }
```

The key is the address. `{ key: 'owner' }` is `entry.props.owner`. `{ key: 'start' }` is `entry.start`. No `source`. Declare a Field when the library has a job — a type, a rollup, a column, an editor. A computed Field cannot roll up or be edited.

```ts
{ key: 'ref', compute: (e) => 1, rollUp: 'sum' }    // ComputedFieldCannotBeWrittenError
{ key: 'start', editable: false }                   // ⚠️ throw or warn — decision 23
{ key: 'props' }                                    // type-checks; throws at runtime
```

`{ key: 'props' }` cannot be a type error without closing `FieldKey` and refusing consumer strings. **Keep the runtime throw.**

`editable: false` refuses **both** doors — ruled 2026-09-09, and that throw is [0015](../0015-write-door/README.md)'s. Do not wire `FieldNotEditableError` at `entries.update()` in this ADR. One resolver in `data/` answers for the cell editor and the drags after 0015 lands.

⚠️ What an **absent** `editable` does at `entries.update()` is decision 18, which has **no recommendation**. Copying the view rule closes the write door by default; splitting absent from `false` keeps today's writes working.
⚠️ Whether a consumer *declaration* on a core key throws at all is decision 23. A `props` **value** naming a core key is settled — a warning, and core wins.
⚠️ `interactions.edit` stays the per-entry affordance override. It is view-level, so it can no longer replace the deleted `{ key: 'start', editable: false }` — decision 19.
⚠️ Decision 12 may require a plugin prefix on plugin Field keys. That changes `gridColumns` and every by-key call for those Fields.

## Read

```ts
entry.props.owner                        // the stored bag, typed by TProps
dataset.entries.fieldValue(id, 'owner')  // any Field key: core, compute, plugin
dataset.entries.fieldValue(id, 'start')  // Instant
dataset.entries.fieldValue(id, 'ref')    // compute / plugin: unknown
```

**Two read doors on the app-author surface, four in all.** `entry.props` is storage; `fieldValue` resolves getters and aggregates. The plugin surface adds `ctx.read(entry, key)` and `ctx.durationOf(entry)`. The two counts name two audiences, so quote the audience with the number.

A `compute` Field's answer stays `unknown` ([#267](https://github.com/Pawel-IT/FreeGantt/issues/267)). `TValue` on `Field` never comes back from the registry, and **the library publishes no type argument here** — see [`refuted.md`](../shared/refuted.md) item 2.

⚠️ `fieldValue` and `FieldContext.read` are one job under two names, and decision 13 covers all four doors.

## Write

```ts
update(id, { start, props: { owner: 'Sam' } })   // props merges; other props keys kept
update(id, { props: { owner: undefined } })      // that key leaves the record
add({ id, name, props: { owner: 'Ali' } })       // a record, not a patch
update(id, { strat: '…' })                       // UnknownFieldError — top level is the schema
```

`PropsEdit<TProps>` is the patch: every key optional, every key removable. `EntryEdit` may remove only what a stored Entry may lack — `parentId`, `start`, `end` **after [ADR 0012](../0012-optional-dates/README.md)**, which has already landed.

⚠️ `start` and `end` are already optional when this ADR builds. The un-date verb is [0012](../0012-optional-dates/README.md)'s. `{ start: undefined }` **must compile** in this ADR's type tests.
⚠️ `plans/02` ships `update(id, { start, cost })`. Nested `props:` drops that shorthand — decision 11. A flat spelling for *declared* keys only is still on the table.
✅ `update({ props: { phase: 3 } })` on an undeclared key **throws `UnknownFieldError`** — decision 1, ruled 2026-09-10. Ingest **carries** it: `add()`, `new Dataset({ entries })` and `fromJSON()` store an undeclared key and round-trip it untouched. A declaration is a *handling* contract, not a storage permission. Two things ship with the rule — the `errors.ts:331` message rewrite, and per-key `props` merging, because a shallow spread deletes a carried key.

## Derived values — ⚠️ [0013](../0013-what-decides-derivation/README.md), do not implement here

```ts
update('phase-1', { props: { cost: 999 } })         // DerivedFieldNotWritableError — after 0013
update('phase-1', { start, props: { cost: 999 } })  // refused whole — after 0013
add({ id, kind: 'group', props: { cost: 500 } })    // succeeds; cost dropped; one warning — after 0013
```

`toJSON()` still writes a rolling-up parent's rolling-up keys **in this ADR**. [0013](../0013-what-decides-derivation/README.md) omits them. Keep `reportCorrectedRollUps` until then.

**AutoGroup conversion is a door in both directions, and a caller sees `kind` change under them.** A dated parent that gains a child starts deriving those dates in that commit. One that loses its last child converts back to a **normal Entry with no dates**. ⚠️ What kind it converts back **to** is decision 8.

**A plugin cascade's write to a derived cell is dropped**, with one warning at `severity: 'warning'` — decision 5, closed. It is exempt from the *throw* only.

## Plugin

```ts
ctx.fields.register({ key: 'progress', type: 'percent', rollUp: '…' })
const extender: EditExtender = (request) =>
  new Map([[phaseId, { start: moved.start, props: { risk: 'high' } }]])
```

Registration still closes when `setup()` returns. Plugin declarations stay out of the Document.

`EditRequest.proposed` is a complete `ProposedEdit` (today `StoredEdit`), and `props` is **required** on it. `durationOf(entry)` returns `Duration | undefined` — that signature is [0012](../0012-optional-dates/README.md)'s.

The published `compute` sample writes `duration.value / MS.DAY`, never the raw constant — decision 15, closed.

⚠️ A complete record and a patch are now the same shape, so a plugin that spreads `proposed.props` into a returned edit proposes **every** key — decision 22. The trap is stated in [`types.md`](types.md); the two candidate fixes are weighed in [0011 open decisions](README.md#open-decisions). Close 22 before [0014](../0014-plugin-author-surface/README.md) decision 16 changes the extender's return.
⚠️ The extender returns `new Map()`, brands ids, and the author writes the composition — decision 16.

## Document — schema 6

```jsonc
{
  "schema": 6,
  "entries": [
    { "id": "phase-1", "kind": "group", "name": "Mobilise" },
    { "id": "t1", "parentId": "phase-1", "name": "Survey",
      "start": "2026-01-05", "end": "2026-01-09",
      "props": { "owner": "Jo", "phase": 2 } }
  ],
  "fields": [ /* consumer-authored only; no `source` */ ]
}
```

`meta` becomes `props`. Dates are already optional (schema **5**, [0012](../0012-optional-dates/README.md)). Derived keys still write — [0013](../0013-what-decides-derivation/README.md) omits them at schema **7**. Unknown keys inside `props` round-trip. Unknown top-level keys stay unknown.

⚠️ The Document key *is* the namespace name. Decide [0014](../0014-plugin-author-surface/README.md) decision 12's marker before schema 6 is the last number this ADR writes. A later prefix is schema **8**, not a rewrite of 6.

## `rollUpKinds` — ⚠️ [0013](../0013-what-decides-derivation/README.md), do not implement here

```ts
dataset.rollUpKinds = ['group', 'milestone']     // drops authored values on those kinds, recalculates
dataset.entries.update('p', { props: { cost: 500 } })
dataset.entries.add({ id: 'c', parentId: 'p' })  // p now rolls up: cost 500 → 40, one ChangeSet row
dataset.history.undo()                           // c leaves, p stops rolling up, cost is 500 again
```

**Decision 6, closed.** An Entry that starts rolling up drops its authored values on rolling-up Fields, and the Rollup recalculates them, at all three doors and with no error. The drop is an ordinary ChangeSet row, undo restores it, and flipping a kind *out* keeps the last derived answer, now authored. The reasoning is in [0013 closed decisions](../0013-what-decides-derivation/README.md#closed-decisions). **This ADR does not implement the drop.**

⚠️ The flip's cause is a config assignment, and `ChangeSet` has no row for one — **decision 24**, open.

## Renames and deletions

| Today | After |
|---|---|
| `Entry.meta` | `Entry.props` |
| `TMeta` + `TFields` | `TProps` |
| `StoredEdit` / `toStoredEdit` | `ProposedEdit` / `toProposedEdit` |
| `DataEdit` (never shipped) | `PropsEdit` |

**Deleted:** `FieldSource`, `Field.source`, the `meta` core Field, `DuplicateFieldSourceError`, `InvalidFieldSourceError`. **Not deleted here:** `CORE_FIELD_OVERRIDABLE_KEYS` ( [0015](../0015-write-door/README.md) decision 19 ), `reportCorrectedRollUps` ( [0013](../0013-what-decides-derivation/README.md) ).

**New errors in this ADR:** `ComputedFieldCannotBeWrittenError` at registration. **Later:** `DerivedFieldNotWritableError` (0013), `FieldNotEditableError` (0015). Conditional: `PluginFieldNotInDataError` (decision 9's store). **No `RollUpKindsWouldDropValuesError`** — decision 6 closed as *drop and recalculate*.

`UnknownFieldError` stays at the top level of an edit, **and inside `props` too** — decision 1 ruled that `update()` never names an undeclared key, so `fieldValue` keeps its guard and one code path. A consumer reads a carried key off `entry.props` directly.
