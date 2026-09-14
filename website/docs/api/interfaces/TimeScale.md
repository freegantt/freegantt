# Interface: TimeScale

Defined in: time/scale.ts:63

## Properties

### contentWidth

> `readonly` **contentWidth**: `number`

Defined in: time/scale.ts:79

Px extent of the whole range at this zoom — what `ScrollModel` binds as its content width.

***

### pxPerMs

> `readonly` **pxPerMs**: `number`

Defined in: time/scale.ts:70

Density: content px per ms, constant across the whole range at this zoom. What `Viewport.zoomBy`
 reads before scaling it (S1.9, D-S1.9-5) — every other quantity `zoomTo`/`zoomBy` need already
 existed. It's a Cartesian scale — constant by construction, not a per-point read.

***

### range

> `readonly` **range**: [`TimeSpan`](TimeSpan.md)

Defined in: time/scale.ts:64

***

### timeZone

> `readonly` **timeZone**: `string`

Defined in: time/scale.ts:66

Dataset's IANA timeZone (D6, #37 — one name for this concept, matching plans/02's DatasetOptions).

## Methods

### instantForX()

> **instantForX**(`x`): [`Instant`](../type-aliases/Instant.md)

Defined in: time/scale.ts:72

#### Parameters

##### x

`number`

#### Returns

[`Instant`](../type-aliases/Instant.md)

***

### ticks()

> **ticks**(`step`, `span`): readonly [`Tick`](Tick.md)[]

Defined in: time/scale.ts:77

Ticks whose cell `[x, x + width)` intersects `span`, aligned to `step`'s boundary in the dataset
 zone — the cell covering `span.x` is emitted even when its own `x` is left of `span`. Whole-range
 callers pass `{ x: 0, width: contentWidth }` — and are greppable.

#### Parameters

##### step

[`TickStep`](TickStep.md)

##### span

[`PixelSpan`](PixelSpan.md)

#### Returns

readonly [`Tick`](Tick.md)[]

***

### widthForDuration()

> **widthForDuration**(`d`, `at`): `number`

Defined in: time/scale.ts:73

#### Parameters

##### d

[`Duration`](Duration.md)

##### at

[`Instant`](../type-aliases/Instant.md)

#### Returns

`number`

***

### xForInstant()

> **xForInstant**(`i`): `number`

Defined in: time/scale.ts:71

#### Parameters

##### i

[`Instant`](../type-aliases/Instant.md)

#### Returns

`number`
