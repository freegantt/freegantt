# Interface: EntryInput\<TProps\>

Defined in: model/stored-entry.ts:93

What a consumer writes; `Entry` is what the library stores. The two differ only in how loose the input
may be: ids are plain strings (the `EntryId` brand is applied on the way in) and dates are any
`InstantInput`. An `Entry` is itself a valid `EntryInput`, so a consumer that already holds branded
values passes them through unchanged.

`Dataset` reads this into a `StoredEntry` once, at construction, in the Dataset's own zone — see
`DateOnlyEndRule` for how a date-only `end` is read.

Every optional key admits an explicit `undefined`, which is what keeps the sentence above true
under `exactOptionalPropertyTypes`: a live `Entry`'s `start` is `Instant | undefined`, and
`entry.toInput()` hands one straight back to `entries.add`.

## Type Parameters

### TProps

`TProps` = `Record`\<`string`, `unknown`\>

## Properties

### end?

> `optional` **end?**: [`InstantInput`](../type-aliases/InstantInput.md)

Defined in: model/stored-entry.ts:106

Exclusive — see plans/01 §5 and `DateOnlyEndRule`. See `start` for when this may be omitted.

***

### id

> **id**: `string`

Defined in: model/stored-entry.ts:94

***

### name

> **name**: `string`

Defined in: model/stored-entry.ts:99

No stored classification (ADR 0013). An Entry derives when it has children — gaining one
 promotes it, losing the last one demotes it, and nothing here says which.

***

### parentId?

> `optional` **parentId?**: `string`

Defined in: model/stored-entry.ts:96

Hierarchy; roots have none.

***

### props?

> `optional` **props?**: `Partial`\<`TProps`\>

Defined in: model/stored-entry.ts:114

Passenger data, and a bag a consumer already holds (ADR 0011, Q15). A declared Field key belongs
 at the top level instead — `entries.add({ id, name, owner: 'Ali' })` — and naming one both here
 and at the top throws. An unknown top-level key, or a key here that names a core key, warns and
 is ignored rather than thrown: this Entry may come from an API this consumer does not own.

***

### segments?

> `optional` **segments?**: readonly [`SegmentInput`](SegmentInput.md)[]

Defined in: model/stored-entry.ts:109

Interrupted work — renders as multiple bars on one row. Omit it and ingest fills one Segment
over `[start, end)`, so a stored `Entry` always has at least one.

***

### start?

> `optional` **start?**: [`InstantInput`](../type-aliases/InstantInput.md)

Defined in: model/stored-entry.ts:104

Optional on every kind (ADR 0012, revises this comment's earlier "required for an authored
span"): an Entry spans if and only if `start` and `end` are both present, and holds no Segment
and draws no bar otherwise. One date with no other is legal and stores as written. An unreadable
date is still an `InvalidInstantError`.
