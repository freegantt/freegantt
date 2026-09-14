# Class: ReservedFieldKeyError

Defined in: model/errors.ts:368

`code: 'reserved-field-key'` — a declaration names `key: 'props'` (ADR 0011). `props` is the one
 reserved key: it is the whole bag a `props`-addressed Field lives inside, so a Field claiming
 that name for itself would collide with the address every other declared Field already uses.

## Extends

- [`FreeGanttError`](FreeGanttError.md)

## Constructors

### Constructor

> **new ReservedFieldKeyError**(`key`): `ReservedFieldKeyError`

Defined in: model/errors.ts:371

#### Parameters

##### key

`string`

#### Returns

`ReservedFieldKeyError`

#### Overrides

[`FreeGanttError`](FreeGanttError.md).[`constructor`](FreeGanttError.md#constructor)

## Properties

### code

> `readonly` **code**: `string`

Defined in: model/errors.ts:31

#### Inherited from

[`FreeGanttError`](FreeGanttError.md).[`code`](FreeGanttError.md#code)

***

### key

> `readonly` **key**: `string`

Defined in: model/errors.ts:369
