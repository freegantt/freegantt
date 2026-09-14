# Class: EmptySegmentsError

Defined in: model/errors.ts:284

`code: 'empty-segments'` — `entries.update(id, { segments: [] })`: every stored Entry keeps at
 least one Segment (#212), so an update cannot empty the list out from under it. `entries.add`
 reads `segments: []` differently and mints one Segment over the entry's own span (S2.3 §1.1) —
 there, `[]` means "the caller named none", and ingest has a whole span to fall back on. An update
 has no such span to invent one from without silently discarding the Segment ids already there, so
 it refuses instead.

## Extends

- [`FreeGanttError`](FreeGanttError.md)

## Constructors

### Constructor

> **new EmptySegmentsError**(`entryId`, `operation`): `EmptySegmentsError`

Defined in: model/errors.ts:288

#### Parameters

##### entryId

[`EntryId`](../type-aliases/EntryId.md)

##### operation

`string`

#### Returns

`EmptySegmentsError`

#### Overrides

[`FreeGanttError`](FreeGanttError.md).[`constructor`](FreeGanttError.md#constructor)

## Properties

### code

> `readonly` **code**: `string`

Defined in: model/errors.ts:31

#### Inherited from

[`FreeGanttError`](FreeGanttError.md).[`code`](FreeGanttError.md#code)

***

### entryId

> `readonly` **entryId**: [`EntryId`](../type-aliases/EntryId.md)

Defined in: model/errors.ts:285

***

### operation

> `readonly` **operation**: `string`

Defined in: model/errors.ts:286
