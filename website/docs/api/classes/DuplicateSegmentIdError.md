# Class: DuplicateSegmentIdError

Defined in: model/errors.ts:219

`code: 'duplicate-segment-id'` — two Segments in the store share one `SegmentId`: authored twice
 in the same `segments` array, authored on two different Entries, or authored on construction
 (#212, ADR 0010). A `SegmentId` is the Selection's identity, so a duplicate is rejected the same
 way a duplicate `EntryId` is — before anything stages. `operation` names which of the three
 throwing calls it was (`entries.add`, `entries.update`, or `construction`), the same way
 `EntryNotFoundError`/`SegmentNotFoundError` name theirs.

## Extends

- [`FreeGanttError`](FreeGanttError.md)

## Constructors

### Constructor

> **new DuplicateSegmentIdError**(`segmentId`, `operation`): `DuplicateSegmentIdError`

Defined in: model/errors.ts:223

#### Parameters

##### segmentId

[`SegmentId`](../type-aliases/SegmentId.md)

##### operation

`string`

#### Returns

`DuplicateSegmentIdError`

#### Overrides

[`FreeGanttError`](FreeGanttError.md).[`constructor`](FreeGanttError.md#constructor)

## Properties

### code

> `readonly` **code**: `string`

Defined in: model/errors.ts:31

#### Inherited from

[`FreeGanttError`](FreeGanttError.md).[`code`](FreeGanttError.md#code)

***

### operation

> `readonly` **operation**: `string`

Defined in: model/errors.ts:221

***

### segmentId

> `readonly` **segmentId**: [`SegmentId`](../type-aliases/SegmentId.md)

Defined in: model/errors.ts:220
