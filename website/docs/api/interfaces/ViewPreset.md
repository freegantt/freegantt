# Interface: ViewPreset

Defined in: time/scale.ts:48

Data, not a switch statement — shipped presets are config objects; custom ones are too (plans/01 §5.1).

## Properties

### headers

> **headers**: readonly [`ViewPresetHeader`](ViewPresetHeader.md)[]

Defined in: time/scale.ts:52

***

### id

> **id**: `string`

Defined in: time/scale.ts:49

***

### minTickWidthPx?

> `optional` **minTickWidthPx?**: `number`

Defined in: time/scale.ts:57

The density floor: below this, this preset's labels stop being legible. Defaults to
 `preferredTickWidthPx` when omitted, which makes a custom preset never compress.

***

### preferredTickWidthPx

> **preferredTickWidthPx**: `number`

Defined in: time/scale.ts:54

The density this preset intends: one tick occupies this many px when nothing else decides.

***

### snap?

> `optional` **snap?**: [`SnapSetting`](../type-aliases/SnapSetting.md)

Defined in: time/scale.ts:60

What a drag snaps to under this preset. Unset reads as `'tick'`. `Gantt.snap` overrides it for
 one Gantt (D-S3-24).

***

### tickIncrement

> **tickIncrement**: `number`

Defined in: time/scale.ts:51

***

### tickUnit

> **tickUnit**: [`TimeUnit`](../type-aliases/TimeUnit.md)

Defined in: time/scale.ts:50
