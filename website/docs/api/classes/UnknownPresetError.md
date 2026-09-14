# Class: UnknownPresetError

Defined in: model/errors.ts:105

`code: 'unknown-preset'` — a `PresetRef` string outside the shipped set, from `resolvePreset`
(S1.9, D-S1.9-3). The shipped set is small and fixed, so the message lists it.

## Extends

- [`FreeGanttError`](FreeGanttError.md)

## Constructors

### Constructor

> **new UnknownPresetError**(`presetId`, `available`): `UnknownPresetError`

Defined in: model/errors.ts:109

#### Parameters

##### presetId

`string`

##### available

readonly `string`[]

#### Returns

`UnknownPresetError`

#### Overrides

[`FreeGanttError`](FreeGanttError.md).[`constructor`](FreeGanttError.md#constructor)

## Properties

### available

> `readonly` **available**: readonly `string`[]

Defined in: model/errors.ts:107

***

### code

> `readonly` **code**: `string`

Defined in: model/errors.ts:31

#### Inherited from

[`FreeGanttError`](FreeGanttError.md).[`code`](FreeGanttError.md#code)

***

### presetId

> `readonly` **presetId**: `string`

Defined in: model/errors.ts:106
