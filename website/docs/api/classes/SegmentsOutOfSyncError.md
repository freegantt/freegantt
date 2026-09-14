# Class: SegmentsOutOfSyncError

Defined in: model/errors.ts:259

`code: 'segments-out-of-sync'` — a `start`/`end` write and the entry's Segments disagree, either
 way (D-S4-30, narrowed by #212; widened by the #212 fix-plan review, finding S3):
 - `'ambiguous'`: the write names `start`/`end` and no Segments, on an entry that draws several.
   The envelope spans the Segments, so moving it alone says nothing about which stretch moved.
 - `'conflicting'`: the write names both `start`/`end` and `segments`, and the segments' own
   envelope is not the `start`/`end` named alongside them — one edit cannot mean both.
 An entry that draws one Segment never sees either: that Segment *is* the envelope, so the write
 updates it in the same transaction and the two halves can only agree.

 `operation` comes from the caller, because `reconcileEnvelope` serves two of them (D-S5-44).

## Extends

- [`FreeGanttError`](FreeGanttError.md)

## Constructors

### Constructor

> **new SegmentsOutOfSyncError**(`entryId`, `reason`, `operation`): `SegmentsOutOfSyncError`

Defined in: model/errors.ts:264

#### Parameters

##### entryId

[`EntryId`](../type-aliases/EntryId.md)

##### reason

`"ambiguous"` \| `"conflicting"`

##### operation

`string`

#### Returns

`SegmentsOutOfSyncError`

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

Defined in: model/errors.ts:260

***

### operation

> `readonly` **operation**: `string`

Defined in: model/errors.ts:262

***

### reason

> `readonly` **reason**: `"ambiguous"` \| `"conflicting"`

Defined in: model/errors.ts:261
