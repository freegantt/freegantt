# Class: SegmentNotFoundError

Defined in: model/errors.ts:164

`code: 'segment-not-found'` — an id `entries.removeSegments()` is given that names no Segment on
 any Entry. This matches `EntryNotFoundError`'s posture for `entries.remove`: the call throws
 before it stages anything, and the transaction discards whatever it staged for other ids.

## Extends

- [`FreeGanttError`](FreeGanttError.md)

## Constructors

### Constructor

> **new SegmentNotFoundError**(`segmentId`, `operation`): `SegmentNotFoundError`

Defined in: model/errors.ts:168

#### Parameters

##### segmentId

[`SegmentId`](../type-aliases/SegmentId.md)

##### operation

`string`

#### Returns

`SegmentNotFoundError`

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

Defined in: model/errors.ts:166

***

### segmentId

> `readonly` **segmentId**: [`SegmentId`](../type-aliases/SegmentId.md)

Defined in: model/errors.ts:165
