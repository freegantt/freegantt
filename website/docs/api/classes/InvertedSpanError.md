# Class: InvertedSpanError

Defined in: model/errors.ts:309

`code: 'inverted-span'` — a span whose `end` sits before its `start`. The repo owner refused this
 at the mutation boundary (2026-09-06 ruling, #143): the write is rejected, not stored and rendered,
 and not silently collapsed. A zero-length span (`start === end`) stays legal — it is the empty
 half-open interval `[t, t)`, a different question from an inverted one.

 The constructor is structural for the reason `InvalidSnapIncrementError`'s is (s5-231 review, F4).
 It names the Entry the consumer wrote, names the Segment as well when the fault is a Segment's
 own, and prints both instants — a bulk load whose zone shifted by an hour is invisible without
 them. It takes `operation` from the caller, because an `EditExtender` cascade reaches the same
 check as `entries.update()` does.

## Extends

- [`FreeGanttError`](FreeGanttError.md)

## Constructors

### Constructor

> **new InvertedSpanError**(`entryId`, `span`, `operation`, `segmentId?`): `InvertedSpanError`

Defined in: model/errors.ts:315

#### Parameters

##### entryId

[`EntryId`](../type-aliases/EntryId.md)

##### span

[`TimeSpan`](../interfaces/TimeSpan.md)

##### operation

`string`

##### segmentId?

[`SegmentId`](../type-aliases/SegmentId.md)

#### Returns

`InvertedSpanError`

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

Defined in: model/errors.ts:310

***

### operation

> `readonly` **operation**: `string`

Defined in: model/errors.ts:312

***

### segmentId?

> `readonly` `optional` **segmentId?**: [`SegmentId`](../type-aliases/SegmentId.md)

Defined in: model/errors.ts:313

***

### span

> `readonly` **span**: [`TimeSpan`](../interfaces/TimeSpan.md)

Defined in: model/errors.ts:311
