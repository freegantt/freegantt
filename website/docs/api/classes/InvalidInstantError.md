# Class: InvalidInstantError

Defined in: model/errors.ts:93

`code: 'invalid-instant'` — a consumer wrote a value on an `InstantInput` field that names no instant
(an unparseable string, or a calendar date that does not exist such as `'2026-02-31'`). `value` is
the thing they wrote, so a bulk loader can name the row it came from.

## Extends

- [`FreeGanttError`](FreeGanttError.md)

## Constructors

### Constructor

> **new InvalidInstantError**(`message`, `value?`): `InvalidInstantError`

Defined in: model/errors.ts:96

#### Parameters

##### message

`string`

##### value?

`unknown`

#### Returns

`InvalidInstantError`

#### Overrides

[`FreeGanttError`](FreeGanttError.md).[`constructor`](FreeGanttError.md#constructor)

## Properties

### code

> `readonly` **code**: `string`

Defined in: model/errors.ts:31

#### Inherited from

[`FreeGanttError`](FreeGanttError.md).[`code`](FreeGanttError.md#code)

***

### value

> `readonly` **value**: `unknown`

Defined in: model/errors.ts:94
