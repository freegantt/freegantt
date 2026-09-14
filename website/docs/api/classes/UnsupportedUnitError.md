# Class: UnsupportedUnitError

Defined in: model/errors.ts:41

`code: 'unsupported-unit'` — a preset or a caller stepped by a unit `time/` has no stepper for.

## Extends

- [`FreeGanttError`](FreeGanttError.md)

## Constructors

### Constructor

> **new UnsupportedUnitError**(`unit`, `operation`): `UnsupportedUnitError`

Defined in: model/errors.ts:44

#### Parameters

##### unit

`string`

##### operation

`string`

#### Returns

`UnsupportedUnitError`

#### Overrides

[`FreeGanttError`](FreeGanttError.md).[`constructor`](FreeGanttError.md#constructor)

## Properties

### code

> `readonly` **code**: `string`

Defined in: model/errors.ts:31

#### Inherited from

[`FreeGanttError`](FreeGanttError.md).[`code`](FreeGanttError.md#code)

***

### unit

> `readonly` **unit**: `string`

Defined in: model/errors.ts:42
