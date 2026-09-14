# Class: InvalidSnapIncrementError

Defined in: model/errors.ts:61

`code: 'invalid-snap-increment'` — a snap `{ unit, increment }` whose `increment` is not a
 positive integer. `time/`'s stepping loops (`snapInstant`, `stepsBetween`) walk forward or
 backward one `increment` at a time until they pass the target; a `0` never advances and a negative
 value walks away from it, so either one loops forever (#201). Thrown by `Gantt.snap`'s setter, so
 the mistake names the assignment rather than the drag two gestures later, and again inside
 `time/` itself, because a custom `ViewPreset`'s own tick reaches the same loop without passing
 through that setter.

## Extends

- [`FreeGanttError`](FreeGanttError.md)

## Constructors

### Constructor

> **new InvalidSnapIncrementError**(`unit`, `increment`): `InvalidSnapIncrementError`

Defined in: model/errors.ts:65

#### Parameters

##### unit

[`TimeUnit`](../type-aliases/TimeUnit.md)

##### increment

`number`

#### Returns

`InvalidSnapIncrementError`

#### Overrides

[`FreeGanttError`](FreeGanttError.md).[`constructor`](FreeGanttError.md#constructor)

## Properties

### code

> `readonly` **code**: `string`

Defined in: model/errors.ts:31

#### Inherited from

[`FreeGanttError`](FreeGanttError.md).[`code`](FreeGanttError.md#code)

***

### increment

> `readonly` **increment**: `number`

Defined in: model/errors.ts:63

***

### unit

> `readonly` **unit**: [`TimeUnit`](../type-aliases/TimeUnit.md)

Defined in: model/errors.ts:62
