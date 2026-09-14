# Class: RegistrationClosedError

Defined in: model/errors.ts:764

`code: 'registration-closed'` — a `ctx.*.register*` call reached after that plugin's `setup()`
 already returned (D-S5-4). Registration is legal only while `setup` is running.

## Extends

- [`FreeGanttError`](FreeGanttError.md)

## Constructors

### Constructor

> **new RegistrationClosedError**(`pluginId`): `RegistrationClosedError`

Defined in: model/errors.ts:767

#### Parameters

##### pluginId

`string`

#### Returns

`RegistrationClosedError`

#### Overrides

[`FreeGanttError`](FreeGanttError.md).[`constructor`](FreeGanttError.md#constructor)

## Properties

### code

> `readonly` **code**: `string`

Defined in: model/errors.ts:31

#### Inherited from

[`FreeGanttError`](FreeGanttError.md).[`code`](FreeGanttError.md#code)

***

### pluginId

> `readonly` **pluginId**: `string`

Defined in: model/errors.ts:765
