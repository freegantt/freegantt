# Interface: StoredEntry\<TProps\>

Defined in: model/stored-entry.ts:32

The values one row stores at one moment (ADR 0017). `Entry` (`entry.ts`) is the other half of
 the pair: it answers questions about a row **now** — `read(key)`, `children()`, `duration()`,
 `hasChildren`. This type answers none of them, and that is deliberate. A pass may hold a row no
 store holds — the Rollup's own effective tree is one — so the questions belong to the pass, and
 every pass that hands a `StoredEntry` hands the answers beside it: an Aggregator reads
 `ctx.read(key)` and `ctx.children()`, a `compute` Field reads `ComputeContext` the same way.

 It is not a second concept. It is one row, with no questions attached.

 An app author meets it in `DatasetOptions.aggregators`, in a Field's `compute` and `distribute`,
 and on `ChangeSet.added[].entity` / `.removed[].entity`.

## Type Parameters

### TProps

`TProps` = `Record`\<`string`, `unknown`\>

## Properties

### end?

> `optional` **end?**: [`Instant`](../type-aliases/Instant.md)

Defined in: model/stored-entry.ts:43

Exclusive — see plans/01 §5. Omitted iff this Entry does not span (ADR 0012); see `start`.

***

### id

> **id**: [`EntryId`](../type-aliases/EntryId.md)

Defined in: model/stored-entry.ts:33

***

### name

> **name**: `string`

Defined in: model/stored-entry.ts:38

What this row is called. Core reads it for the Grid's default label and for nothing else.

***

### parentId?

> `optional` **parentId?**: [`EntryId`](../type-aliases/EntryId.md)

Defined in: model/stored-entry.ts:36

Hierarchy; roots have none. An Entry has no stored classification (ADR 0013): it derives when
 it has children, and `Entry.hasChildren` is what answers that.

***

### props

> **props**: `Readonly`\<`Partial`\<`TProps`\>\>

Defined in: model/stored-entry.ts:54

Consumer-owned. A Field key is the whole address (ADR 0011): `{ key: 'cost' }` reads and writes
 `entry.props.cost`, and nothing declares a `source`. Always present — ingest fills `{}`, the
 same rule `segments` already follows, so no reader carries a "no props" branch. `Partial<TProps>`
 because a required key on `TProps` is still one a stored record may lack: `add({ id, name })`
 reaches that state on its own, with no write to refuse it.

***

### segments

> **segments**: readonly [`Segment`](Segment.md)[]

Defined in: model/stored-entry.ts:48

Every stretch this Entry draws. Empty when the Entry does not span (ADR 0012, revises #212's
"never empty"). A spanning Entry stores at least one Segment: interrupted work stores several
bars on one row; everything else stores the single Segment ingest filled in over `[start, end)`.
`start` and `end` stay the envelope over all of them.

***

### start?

> `optional` **start?**: [`Instant`](../type-aliases/Instant.md)

Defined in: model/stored-entry.ts:41

Omitted iff this Entry does not span (ADR 0012). Present with `end` if and only if it holds a
Segment and draws a bar.
