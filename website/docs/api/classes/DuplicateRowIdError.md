# Class: DuplicateRowIdError

Defined in: model/errors.ts:680

`code: 'duplicate-row-id'` — `{ source: 'custom' }` returned two `CustomRow`s with the same `id`.

## Extends

- [`FreeGanttError`](FreeGanttError.md)

## Constructors

### Constructor

> **new DuplicateRowIdError**(`rowId`): `DuplicateRowIdError`

Defined in: model/errors.ts:683

#### Parameters

##### rowId

`string`

#### Returns

`DuplicateRowIdError`

#### Overrides

[`FreeGanttError`](FreeGanttError.md).[`constructor`](FreeGanttError.md#constructor)

## Properties

### code

> `readonly` **code**: `string`

Defined in: model/errors.ts:31

#### Inherited from

[`FreeGanttError`](FreeGanttError.md).[`code`](FreeGanttError.md#code)

***

### rowId

> `readonly` **rowId**: `string`

Defined in: model/errors.ts:681
