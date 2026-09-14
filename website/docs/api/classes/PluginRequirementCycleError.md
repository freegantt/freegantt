# Class: PluginRequirementCycleError

Defined in: model/errors.ts:749

`code: 'plugin-requirement-cycle'` — two or more plugins require each other, so no setup order
 satisfies every `requires` (D-S5-31). This is not the `PluginOrderError` D-S5-31 refuses: installation
 computes the order, so a caller can no longer write a wrong one — but a cycle leaves no right one
 to compute. Thrown at construction, naming every plugin in the cycle.

## Extends

- [`FreeGanttError`](FreeGanttError.md)

## Constructors

### Constructor

> **new PluginRequirementCycleError**(`pluginIds`): `PluginRequirementCycleError`

Defined in: model/errors.ts:752

#### Parameters

##### pluginIds

readonly `string`[]

#### Returns

`PluginRequirementCycleError`

#### Overrides

[`FreeGanttError`](FreeGanttError.md).[`constructor`](FreeGanttError.md#constructor)

## Properties

### code

> `readonly` **code**: `string`

Defined in: model/errors.ts:31

#### Inherited from

[`FreeGanttError`](FreeGanttError.md).[`code`](FreeGanttError.md#code)

***

### pluginIds

> `readonly` **pluginIds**: readonly `string`[]

Defined in: model/errors.ts:750
