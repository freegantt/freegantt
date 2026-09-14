# Class: PluginSetupError

Defined in: model/errors.ts:779

`code: 'plugin-setup-failed'` — a plugin's `setup()` threw. Every plugin already set up in this
 install batch is disposed, in reverse order, before this is thrown (issue #137 F4).

## Extends

- [`FreeGanttError`](FreeGanttError.md)

## Constructors

### Constructor

> **new PluginSetupError**(`pluginId`, `cause`, `message?`): `PluginSetupError`

Defined in: model/errors.ts:782

#### Parameters

##### pluginId

`string`

##### cause

`unknown`

##### message?

`string`

#### Returns

`PluginSetupError`

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

Defined in: model/errors.ts:780

## Methods

### wrongInstallSite()

> `static` **wrongInstallSite**(`pluginId`): `PluginSetupError`

Defined in: model/errors.ts:800

ADR 0019, `Q4`: a plugin with a `data` half was handed to a `Gantt`. It arrived too late to
 declare a Field, so it fails loudly and says where it goes instead. Same error, same `code` —
 a misplaced plugin is a setup that did not happen, and it needs no type of its own.

 The message quotes the id and shows the **site**, never a call (`F26`). A `PluginId` is a dotted
 string, so `plugins: [acme.locks]` reads as a property access on an object named `acme` — it is
 not pasteable, and the library cannot know the name of the variable the author holds.

#### Parameters

##### pluginId

`string`

#### Returns

`PluginSetupError`
