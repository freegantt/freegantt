# Class: RendererAlreadyRegisteredError

Defined in: model/errors.ts:817

`code: 'renderer-already-registered'` — two plugins both call `ctx.view.registerRenderer` for the
 same slot (S5.4, D-S5-11). A consumer who wants a plugin's renderer to win removes its own
 `GanttOptions` renderer instead — this error is only for two *plugins* colliding.
 `slot` names what collided: a renderer point (`'cell'`), or one kind of the `bar` point's
 per-kind form (`'bar:buffer'`, D-S5-12, review P2). It stays a bare `string` here (not layout/'s
 `RendererPoint`) — model/ is a leaf and may import nothing (model-is-leaf).

## Extends

- [`FreeGanttError`](FreeGanttError.md)

## Constructors

### Constructor

> **new RendererAlreadyRegisteredError**(`slot`, `firstPluginId`, `secondPluginId`): `RendererAlreadyRegisteredError`

Defined in: model/errors.ts:822

#### Parameters

##### slot

`string`

##### firstPluginId

`string`

##### secondPluginId

`string`

#### Returns

`RendererAlreadyRegisteredError`

#### Overrides

[`FreeGanttError`](FreeGanttError.md).[`constructor`](FreeGanttError.md#constructor)

## Properties

### code

> `readonly` **code**: `string`

Defined in: model/errors.ts:31

#### Inherited from

[`FreeGanttError`](FreeGanttError.md).[`code`](FreeGanttError.md#code)

***

### firstPluginId

> `readonly` **firstPluginId**: `string`

Defined in: model/errors.ts:819

***

### secondPluginId

> `readonly` **secondPluginId**: `string`

Defined in: model/errors.ts:820

***

### slot

> `readonly` **slot**: `string`

Defined in: model/errors.ts:818
