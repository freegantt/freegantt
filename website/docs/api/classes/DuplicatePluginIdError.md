# Class: DuplicatePluginIdError

Defined in: model/errors.ts:696

`code: 'duplicate-plugin-id'` — two entries of one `plugins` list share one `PluginId` (D-S5-3).
 A `Gantt`'s own list and the Dataset's are checked together, because one `requires` graph covers
 both (ADR 0019).

## Extends

- [`FreeGanttError`](FreeGanttError.md)

## Constructors

### Constructor

> **new DuplicatePluginIdError**(`pluginId`): `DuplicatePluginIdError`

Defined in: model/errors.ts:699

#### Parameters

##### pluginId

`string`

#### Returns

`DuplicatePluginIdError`

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

Defined in: model/errors.ts:697
