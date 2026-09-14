# Class: ScrollModel

Defined in: layout/viewport/scroll-model.ts:81

## Constructors

### Constructor

> **new ScrollModel**(`position?`): `ScrollModel`

Defined in: layout/viewport/scroll-model.ts:91

#### Parameters

##### position?

`Partial`\<[`Point`](../interfaces/Point.md)\>

#### Returns

`ScrollModel`

## Accessors

### state

#### Get Signature

> **get** **state**(): [`ScrollState`](../interfaces/ScrollState.md)

Defined in: layout/viewport/scroll-model.ts:97

Resolved + clamped, memoized until an input changes.

##### Returns

[`ScrollState`](../interfaces/ScrollState.md)

## Methods

### batch()

> **batch**(`run`): `void`

Defined in: layout/viewport/scroll-model.ts:114

Several writes, at most one notification. Re-entrant; flushes at the outermost exit,
in a `finally` so a throwing `run` cannot wedge the model (conventions §5).

#### Parameters

##### run

() => `void`

#### Returns

`void`

***

### panTo()

> **panTo**(`to`): `void`

Defined in: layout/viewport/scroll-model.ts:103

Move the shared viewport. Clamps to `[0, max]` at write time (D-S1.5-2) — nothing else ever
rewrites `position`; a later shrink of `max` leaves it exactly where a caller last asked.

#### Parameters

##### to

`Partial`\<[`ScrollPosition`](../type-aliases/ScrollPosition.md)\>

#### Returns

`void`
