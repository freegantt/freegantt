# The call sites after ADR 0011

**Governing:** [ADR 0011](../../docs/adr/0011-consumer-values-live-in-props-and-a-derived-value-never-persists.md). The types behind these calls are in [`types.md`](types.md); the open questions are in [`open-decisions.md`](open-decisions.md).

**Nothing here is implemented.** A ⚠️ marks a call an open decision can still change.

## What changes

| | today | after |
|---|---|---|
| Stored Entry | `meta?: TMeta` | `props: Readonly<Partial<TProps>>`, always present (`{}` when absent) |
| `EntryEdit` | `meta?: TMeta`, **replaces** | `props?: PropsEdit<TProps>`, **merges** |
| Field address | `source: FieldSource` | the Field key, or `compute` |
| Generics | `Dataset<TMeta, TFields>` | `Dataset<TProps>` |
| Rolling-up parent value | stored **and** written to the Document | stored, **never** written to the Document |
| `start` / `end` | required except on a rolling-up kind | optional on every kind |
| Schema | 4 | 5 ⚠️ — higher if decision 25 bumps per group |

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

An Entry has dates if and only if it holds at least one Segment. No dates draws no bar. The grid row still shows.

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

`editable: false` refuses **both** doors — ruled 2026-09-09. `entries.update()` throws `FieldNotEditableError`, and one resolver in `data/` answers for the cell editor and the drags too.

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

**Two read doors on the app-author surface, four in all.** `entry.props` is storage; `fieldValue` resolves getters and aggregates. The plugin surface adds `ctx.read(entry, key)` and `ctx.durationOf(entry)`. The two counts name two audiences, so quote the audience with the number. Decision 13 covers all four.

A `compute` Field's answer stays `unknown` ([#267](https://github.com/Pawel-IT/FreeGantt/issues/267)). `TValue` on `Field` never comes back from the registry, and **the library publishes no type argument here** — see [`refuted.md`](refuted.md) item 2.

⚠️ `fieldValue` and `FieldContext.read` are one job under two names — decision 13.

## Write

```ts
update(id, { start, props: { owner: 'Sam' } })   // props merges; other props keys kept
update(id, { props: { owner: undefined } })      // that key leaves the record
add({ id, name, props: { owner: 'Ali' } })       // a record, not a patch
update(id, { strat: '…' })                       // UnknownFieldError — top level is the schema
```

`PropsEdit<TProps>` is the patch: every key optional, every key removable. `EntryEdit` may remove only what a stored Entry may lack — `parentId`, `start`, `end` **after group D**.

⚠️ `start` and `end` are required on `Entry` at HEAD, so the un-date verb does not compile between group A and group D.
⚠️ `plans/02` ships `update(id, { start, cost })`. Nested `props:` drops that shorthand — decision 11. A flat spelling for *declared* keys only is still on the table.
⚠️ Whether `update({ props: { phase: 3 } })` on an undeclared key succeeds is decision 1, and it is **open**. Decision 1 currently *recommends* a throw; a recommendation is not a ruling, so write neither behaviour yet. Round-trip of undeclared keys at ingest stays either way.

## Derived values

```ts
update('phase-1', { props: { cost: 999 } })         // DerivedFieldNotWritableError
update('phase-1', { start, props: { cost: 999 } })  // refused whole
add({ id, kind: 'group', props: { cost: 500 } })    // succeeds; cost dropped; one warning
```

`toJSON()` omits a rolling-up parent's rolling-up keys.

**AutoGroup conversion is a door in both directions, and a caller sees `kind` change under them.** A dated parent that gains a child starts deriving those dates in that commit. One that loses its last child converts back to a **normal Entry with no dates**. ⚠️ What kind it converts back **to** is decision 8.

**A plugin cascade's write to a derived cell is dropped**, with one warning at `severity: 'warning'` — decision 5, closed. It is exempt from the *throw* only.

## Plugin

```ts
ctx.fields.register({ key: 'progress', type: 'percent', rollUp: '…' })
const extender: EditExtender = (request) =>
  new Map([[phaseId, { start: moved.start, props: { risk: 'high' } }]])
```

Registration still closes when `setup()` returns. Plugin declarations stay out of the Document.

`EditRequest.proposed` is a complete `ProposedEdit` (today `StoredEdit`), and `props` is **required** on it. `durationOf(entry)` returns `Duration | undefined`.

The published `compute` sample writes `duration.value / MS.DAY`. `MS` is public (`api/index.ts:365`) and the library uses it itself at `core-fields.ts:46`. **Never publish the raw constant** — decision 15, closed.

⚠️ A complete record and a patch are now the same shape, so a plugin that spreads `proposed.props` into a returned edit proposes **every** key — decision 22. The trap is stated in [`types.md`](types.md); the two candidate fixes are weighed in [`open-decisions.md`](open-decisions.md).
⚠️ The extender returns `new Map()`, brands ids, and the author writes the composition — decision 16.

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

⚠️ The Document key *is* the namespace name. Decide decision 12's marker before schema 5 is written.
⚠️ `5` is the end state under one bump. Decision 25 asks whether each group bumps instead, which ends higher.

## `rollUpKinds`

```ts
dataset.rollUpKinds = ['group', 'milestone']     // drops authored values on those kinds, recalculates
dataset.entries.update('p', { props: { cost: 500 } })
dataset.entries.add({ id: 'c', parentId: 'p' })  // p now rolls up: cost 500 → 40, one ChangeSet row
dataset.history.undo()                           // c leaves, p stops rolling up, cost is 500 again
```

**Decision 6, closed.** An Entry that starts rolling up drops its authored values on rolling-up Fields, and the Rollup recalculates them. **No error, at any of the three doors** — promotion, a `kind` write, a `rollUpKinds` flip. The drop is an ordinary ChangeSet row and undo restores it. `rollUpKinds` is **not** a destructive setter and history is never cleared. Flipping a kind *out* keeps the last derived answer, now authored.

⚠️ The flip's cause is a config assignment, and `ChangeSet` has no row for one. Either the undo step reverses the config key too, or the flip's drops stay out of history — **decision 24**, open.

## Renames and deletions

| Today | After |
|---|---|
| `Entry.meta` | `Entry.props` |
| `TMeta` + `TFields` | `TProps` |
| `StoredEdit` / `toStoredEdit` | `ProposedEdit` / `toProposedEdit` |
| `DataEdit` (never shipped) | `PropsEdit` |

**Deleted:** `FieldSource`, `Field.source`, the `meta` core Field, `DuplicateFieldSourceError`, `InvalidFieldSourceError`, `CORE_FIELD_OVERRIDABLE_KEYS`, `reportCorrectedRollUps`.

**New errors:** `DerivedFieldNotWritableError`, `ComputedFieldCannotBeWrittenError`, `FieldNotEditableError`. Conditional: `PluginFieldNotInDataError` (decision 9's store). **No `RollUpKindsWouldDropValuesError`** — decision 6 closed as *drop and recalculate*.

`UnknownFieldError` stays at the top level of an edit. `fieldValue` stops throwing it only if decision 1 lets undeclared keys into the ChangeSet.
