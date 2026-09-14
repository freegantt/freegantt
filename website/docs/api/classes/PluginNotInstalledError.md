# Class: PluginNotInstalledError

Defined in: model/errors.ts:714

`code: 'plugin-not-installed'` — `gantt.uninstallPlugin` named a plugin this Gantt does not have
 installed (D-S5-36). The verb acts on the installed set, and it never adds to it, so a name
 nothing installs is a mistake rather than a silent no-op — the same call D-S5-34 made for
 `UnknownGridColumnError`. Distinct from `MissingPluginError`, which is a `requires` entry no
 `plugins` list supplies.

## Extends

- [`FreeGanttError`](FreeGanttError.md)

## Constructors

### Constructor

> **new PluginNotInstalledError**(`pluginId`): `PluginNotInstalledError`

Defined in: model/errors.ts:717

#### Parameters

##### pluginId

`string`

#### Returns

`PluginNotInstalledError`

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

Defined in: model/errors.ts:715
