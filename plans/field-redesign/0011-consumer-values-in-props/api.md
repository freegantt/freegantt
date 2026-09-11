# The call sites after ADR 0011

**Governing:** [ADR 0011](../../../docs/adr/0011-consumer-values-live-in-props.md). The types behind these calls are in [`types.md`](types.md); the rulings behind them are in [0011 closed decisions](README.md#closed-decisions).

**Nothing here is implemented, and every line here is 0011's.** A call another ADR owns is not shown. 0011 lands after [0016](../../../docs/adr/0016-the-library-holds-no-save-format.md) and [0012](../0012-optional-dates/README.md), so optional dates are already true when this ADR builds. There is no Document.

## What this ADR changes

| | today (after 0012) | after this ADR |
|---|---|---|
| Stored Entry | `meta?: TMeta` | `props: Readonly<Partial<TProps>>`, always present (`{}` when absent) |
| `EntryEdit` | `meta?: TMeta`, **replaces** | envelope + declared keys at the top, **merges**; no `props:` key |
| Field address | `source: FieldSource` | the Field key, or `compute` |
| Generics | `Dataset<TMeta, TFields>` | `Dataset<TProps>` |
| Schema | none — ADR 0016 deleted the Document | none |

## The whole shape, in one block

```ts
interface ConsumerEntryProps {
  owner?: string;
  progress?: number;
  cost?: number;
}

const dataset = new Dataset<ConsumerEntryProps>({
  timeZone: 'UTC',
  entries: [
    { id: 'p1', name: 'Mobilise' },   // no dates; has a child → derives (0013)
    { id: 't1', parentId: 'p1', name: 'Survey',
      start: '2026-01-05', end: '2026-01-09',
      owner: 'Jo', progress: 40, cost: 500 },
    // Q15: nested props still legal here for passengers / a bag you already hold
    { id: 't2', name: 'Legacy', props: { extra: 1, owner: 'Pat' } },
  ],
  fields: [
    { key: 'owner', column: { header: 'Own', align: 'center' } },
    { key: 'progress', type: 'percent', rollUp: 'weightedMeanByDuration', editable: true },
    { key: 'ref', compute: (entry) => rowNumber(entry.id) },
  ],
});

dataset.entries.get('t1')?.props.owner
dataset.entries.read('t1', 'owner')
dataset.entries.update('t1', { start: '2026-01-06', owner: 'Sam' })  // merges; no props: wrapper
```

## Dataset

```ts
new Dataset<ConsumerEntryProps>({ timeZone, entries, fields, plugins })
```

One generic types `entry.props` and the `props` patch. The published plugin types lose their second parameter too: `DatasetOptions`, `DatasetPlugin`, `DatasetPluginContext`. There is no `fromJSON` / `toJSON` — [ADR 0016](../../../docs/adr/0016-the-library-holds-no-save-format.md).

A plugin's keys are **not** in `TProps`. [0014](../0014-plugin-author-surface/README.md) widens the write door to `PropsEdit<TProps & PluginEntryProps>` later; this ADR ships the one generic.

## Entry

```ts
entry.props.owner         // stored consumer values. Always present; `{}` when empty.
entry.start / entry.end   // already optional — 0012 landed first
```

## Field declaration

```ts
{ key: 'owner', column: { header: 'Own' } }
{ key: 'progress', type: 'percent', rollUp: 'weightedMeanByDuration', editable: true }
{ key: 'ref', compute: (entry, ctx) => rowNumber(entry.id) }
```

The key is the address. `{ key: 'owner' }` is `entry.props.owner`. `{ key: 'start' }` is `entry.start`. No `source`. Declare a Field when the library has a job — a type, a rollup, a column, an editor. A computed Field cannot roll up or be edited.

```ts
{ key: 'ref', compute: (e) => 1, rollUp: 'sum' }    // ComputedFieldCannotBeWrittenError — this ADR
{ key: 'props' }                                    // type-checks; throws at runtime
```

`{ key: 'props' }` cannot be a type error without closing `FieldKey` and refusing consumer strings. **Keep the runtime throw.**

**`{ key: 'start', editable: false }` keeps constructing, and this ADR does not touch what it refuses.** Do not wire `FieldNotEditableError` at `entries.update()` here — that is [0015](../0015-write-door/README.md)'s arm. Decision 18 closed: `editable` is `'never' | 'api' | 'anywhere'`; `false` aliases `'never'`.

A `props` **value** naming a core key is a warning, and core's definition wins — [the ruling](README.md#a-props-key-that-names-a-core-key--warning-and-the-core-definition-wins).

## Read

```ts
entry.props.owner                        // the stored bag, typed by TProps
dataset.entries.read(id, 'owner')        // any Field key: core, compute, plugin
dataset.entries.read(id, 'start')        // Instant
dataset.entries.read(id, 'ref')          // compute / plugin: unknown
dataset.entries.read(id, 'duration')     // Duration | undefined after 0012
ctx.read(entry, 'duration')              // same door on the plugin surface
```

**Two read doors on the app-author surface.** `entry.props` is storage; `read` resolves getters and aggregates. The plugin surface uses the same name: `ctx.read(entry, key)`. [0014](../0014-plugin-author-surface/README.md) decision 13 renamed `fieldValue` to `read` and deleted `durationOf`. Duration is a compute Field.

A `compute` Field's answer stays `unknown` ([#267](https://github.com/Pawel-IT/FreeGantt/issues/267)). `TValue` on `Field` never comes back from the registry, and **the library publishes no type argument here** — see [`refuted.md`](../shared/refuted.md) item 2.

## Write

```ts
update(id, { start, owner: 'Sam' })          // declared keys at the top; other props keys kept
update(id, { owner: undefined })             // that key leaves the record
add({ id, name, owner: 'Ali' })              // flat, same as update — grill 2026-09-10
update(id, { strat: '…' })                   // UnknownFieldError — top level is closed
add({ id, name, extra: 1 })                  // UnknownFieldError — extra is not a Field
update(id, { props: { owner: 'Sam' } })      // refused — name owner at the top
```

`EntryEdit<TProps>` is the envelope plus declared-key shorthand. `add()` takes the same flat shape. Constructor `entries` also take declared keys at the top ([Q15](README.md#q15--constructor-entries-take-declared-keys-at-the-top)); nested `props` stays legal there for passengers. `PropsEdit<TProps>` is the nested bag on constructor ingest and on a complete `ProposedEdit`, not on `add()` or `update()`. An edit may remove only what a stored Entry may lack — `parentId`, `start`, `end`.

**`{ start: undefined }` must compile in this ADR's type tests.** The un-date verb is 0012's, and 0012 has landed, so `EntryEdit` follows `Entry` here. Do not skip those tests.

**An undeclared key is carried at constructor ingest and never named at `add()` or `update()`.** Constructor ingest warns on an unknown top-level key and still carries undeclared keys inside `props`. A declaration is a *handling* contract, not a storage permission — [decision 1](README.md#1--an-undeclared-key-is-carried-and-update-never-names-it).

## Plugin

```ts
ctx.fields.register({ key: 'scheduling:progress', type: 'percent', rollUp: '…' })
const extender: EditExtender = (request) =>
  new Map([[phaseId, { start: moved.start, risk: 'high' }]])
```

Registration still closes when `setup()` returns. Plugin declarations are code; they are not saved.

`EditRequest.proposed` is a complete `ProposedEdit` (today `StoredEdit`), and `props` is **required** on it. A complete record and a patch are now the same shape, so a plugin that spreads `proposed.props` into a returned edit would propose **every** key. [Decision 22](README.md#22--brand-the-whole-proposededit) brands the whole `ProposedEdit` to refuse that spread; the type test is in [`types.md`](types.md).

The published `compute` sample writes `duration.value / MS.DAY`, never the raw constant.

## No Document

[ADR 0016](../../../docs/adr/0016-the-library-holds-no-save-format.md) deleted the save format. This ADR writes **no schema number**. Constructor ingest carries undeclared keys inside `props`. Unknown top-level keys warn. `reportCorrectedRollUps` is already gone.

## Renames and deletions

| Today | After |
|---|---|
| `Entry.meta` | `Entry.props` |
| `TMeta` + `TFields` | `TProps` |
| `StoredEdit` / `toStoredEdit` | `ProposedEdit` / `toProposedEdit` |
| `DataEdit` (never shipped) | `PropsEdit` |

**Deleted:** `FieldSource`, `Field.source`, the `meta` core Field, `DuplicateFieldSourceError`, `InvalidFieldSourceError`.

**Not deleted here:** `CORE_FIELD_OVERRIDABLE_KEYS` ([0015](../0015-write-door/README.md) keeps it). `reportCorrectedRollUps` went with ADR 0016.

**New error in this ADR:** `ComputedFieldCannotBeWrittenError`, at registration. `DerivedFieldNotWritableError` (0013) and `FieldNotEditableError` (0015) come later. Three errors never exist: **no `PluginFieldNotInDataError`**, **no `RollUpKindsWouldDropValuesError`**, **no `FieldNamedAtTopAndInPropsError`**.
