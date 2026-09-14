# Class: TimeScaleModel

Defined in: layout/viewport/time-scale-model.ts:135

## Constructors

### Constructor

> **new TimeScaleModel**(`options?`): `TimeScaleModel`

Defined in: layout/viewport/time-scale-model.ts:151

#### Parameters

##### options?

[`TimeScaleModelOptions`](../interfaces/TimeScaleModelOptions.md) = `{}`

#### Returns

`TimeScaleModel`

## Accessors

### fit

#### Get Signature

> **get** **fit**(): [`TimeScaleFit`](../type-aliases/TimeScaleFit.md)

Defined in: layout/viewport/time-scale-model.ts:184

##### Returns

[`TimeScaleFit`](../type-aliases/TimeScaleFit.md)

#### Set Signature

> **set** **fit**(`f`): `void`

Defined in: layout/viewport/time-scale-model.ts:190

Live. `'pane'` (default) fits the measured pane width; `'preset'` ignores it; an explicit
 `number` is `pxPerMs` (D-S1.9-2).

##### Parameters

###### f

[`TimeScaleFit`](../type-aliases/TimeScaleFit.md)

##### Returns

`void`

***

### preset

#### Get Signature

> **get** **preset**(): [`ViewPreset`](../interfaces/ViewPreset.md)

Defined in: layout/viewport/time-scale-model.ts:158

##### Returns

[`ViewPreset`](../interfaces/ViewPreset.md)

#### Set Signature

> **set** **preset**(`ref`): `void`

Defined in: layout/viewport/time-scale-model.ts:165

Live — every config key is live-reconfigurable (plans/02 §1.1). Resolved through
 `resolvePreset` (throws `UnknownPresetError` for an unknown id); no-op, no invalidation, when
 the resolved preset is unchanged (D-S1.9-3).

##### Parameters

###### ref

[`PresetRef`](../type-aliases/PresetRef.md)

##### Returns

`void`

***

### range

#### Get Signature

> **get** **range**(): [`TimeSpan`](../interfaces/TimeSpan.md) \| `"fitDataset"`

Defined in: layout/viewport/time-scale-model.ts:172

##### Returns

[`TimeSpan`](../interfaces/TimeSpan.md) \| `"fitDataset"`

#### Set Signature

> **set** **range**(`r`): `void`

Defined in: layout/viewport/time-scale-model.ts:178

Live. `'fitDataset'` spans every bound dataset's entries; a `TimeSpan` pins the axis. Anchored
 zoom (`Viewport.zoomTo`/`zoomBy`) never writes this (D-F′) — only a caller does.

##### Parameters

###### r

[`TimeSpan`](../interfaces/TimeSpan.md) \| `"fitDataset"`

##### Returns

`void`

***

### scale

#### Get Signature

> **get** **scale**(): [`TimeScale`](../interfaces/TimeScale.md)

Defined in: layout/viewport/time-scale-model.ts:196

##### Returns

[`TimeScale`](../interfaces/TimeScale.md)

## Methods

### batch()

> **batch**(`run`): `void`

Defined in: layout/viewport/time-scale-model.ts:208

Several writes, at most one notification, delivered iff the resolved scale actually changed
(D-S1.5-4). Re-entrant; flushes at the outermost exit, in a `finally` so a throwing `run` cannot
wedge the model (conventions §5).

#### Parameters

##### run

() => `void`

#### Returns

`void`
