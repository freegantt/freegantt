# Class: UnknownFieldError

Defined in: model/errors.ts:333

`code: 'unknown-field'` — an edit or `entry.read(key)` naming a key that is not a declared
 Field. The registry is the legal set: core Fields plus the consumer's (D-S4-5, D-S2-26).

## Extends

- [`FreeGanttError`](FreeGanttError.md)

## Constructors

### Constructor

> **new UnknownFieldError**(`field`, `operation`): `UnknownFieldError`

Defined in: model/errors.ts:337

#### Parameters

##### field

[`FieldKey`](../type-aliases/FieldKey.md)

##### operation

`string`

#### Returns

`UnknownFieldError`

#### Overrides

[`FreeGanttError`](FreeGanttError.md).[`constructor`](FreeGanttError.md#constructor)

## Properties

### code

> `readonly` **code**: `string`

Defined in: model/errors.ts:31

#### Inherited from

[`FreeGanttError`](FreeGanttError.md).[`code`](FreeGanttError.md#code)

***

### field

> `readonly` **field**: [`FieldKey`](../type-aliases/FieldKey.md)

Defined in: model/errors.ts:334

***

### operation

> `readonly` **operation**: `string`

Defined in: model/errors.ts:335
