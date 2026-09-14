# Class: MissingPluginError

Defined in: model/errors.ts:730

`code: 'missing-plugin'` — a plugin names a `requires` id that the same `plugins` list
 does not install (D-S5-31). Thrown at construction, naming both ids. `requires` is a check, never
 a supplier: a missing prerequisite is this error, not a quiet default.

## Extends

- [`FreeGanttError`](FreeGanttError.md)

## Constructors

### Constructor

> **new MissingPluginError**(`pluginId`, `requiredId`): `MissingPluginError`

Defined in: model/errors.ts:734

#### Parameters

##### pluginId

`string`

##### requiredId

`string`

#### Returns

`MissingPluginError`

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

Defined in: model/errors.ts:731

***

### requiredId

> `readonly` **requiredId**: `string`

Defined in: model/errors.ts:732
