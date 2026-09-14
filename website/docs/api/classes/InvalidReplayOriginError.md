# Class: InvalidReplayOriginError

Defined in: model/errors.ts:666

`code: 'invalid-replay-origin'` — `replay(changeSet)` given a changeset whose `origin` is not
`'undo'` or `'redo'`. `'user'` is `apply`'s door (D-S2-11), not open yet
(`plans/s2-data-core/s2b-undo-replay-seam.md`).

## Extends

- [`FreeGanttError`](FreeGanttError.md)

## Constructors

### Constructor

> **new InvalidReplayOriginError**(`origin`): `InvalidReplayOriginError`

Defined in: model/errors.ts:669

#### Parameters

##### origin

`string`

#### Returns

`InvalidReplayOriginError`

#### Overrides

[`FreeGanttError`](FreeGanttError.md).[`constructor`](FreeGanttError.md#constructor)

## Properties

### code

> `readonly` **code**: `string`

Defined in: model/errors.ts:31

#### Inherited from

[`FreeGanttError`](FreeGanttError.md).[`code`](FreeGanttError.md#code)

***

### origin

> `readonly` **origin**: `string`

Defined in: model/errors.ts:667
