# Class: RevealTargetNotFoundError

Defined in: model/errors.ts:184

`code: 'reveal-target-not-found'` — `reveal(id)` given an id the dataset reads as neither an
 Entry nor a Segment (#212, ADR 0010, issue #227). `reveal` alone takes `EntryId | SegmentId`; once
 neither reading resolves, nothing tells which one the caller meant, so the message names both
 rather than picking `EntryNotFoundError` or `SegmentNotFoundError` and forging the id's brand to
 match.

## Extends

- [`FreeGanttError`](FreeGanttError.md)

## Constructors

### Constructor

> **new RevealTargetNotFoundError**(`targetId`, `operation`): `RevealTargetNotFoundError`

Defined in: model/errors.ts:188

#### Parameters

##### targetId

`string`

##### operation

`string`

#### Returns

`RevealTargetNotFoundError`

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

Defined in: model/errors.ts:186

***

### targetId

> `readonly` **targetId**: `string`

Defined in: model/errors.ts:185
