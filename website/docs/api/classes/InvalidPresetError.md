# Class: InvalidPresetError

Defined in: model/errors.ts:123

`code: 'invalid-preset'` — a `ViewPreset` whose `preferredTickWidthPx` is below its own
`minTickWidthPx`, from `resolvePreset` (header readability follow-up). The floor would then be
unreachable at the preset's own intended zoom, which is never a preset author's intent.

## Extends

- [`FreeGanttError`](FreeGanttError.md)

## Constructors

### Constructor

> **new InvalidPresetError**(`presetId`, `minTickWidthPx`, `preferredTickWidthPx`): `InvalidPresetError`

Defined in: model/errors.ts:128

#### Parameters

##### presetId

`string`

##### minTickWidthPx

`number`

##### preferredTickWidthPx

`number`

#### Returns

`InvalidPresetError`

#### Overrides

[`FreeGanttError`](FreeGanttError.md).[`constructor`](FreeGanttError.md#constructor)

## Properties

### code

> `readonly` **code**: `string`

Defined in: model/errors.ts:31

#### Inherited from

[`FreeGanttError`](FreeGanttError.md).[`code`](FreeGanttError.md#code)

***

### minTickWidthPx

> `readonly` **minTickWidthPx**: `number`

Defined in: model/errors.ts:125

***

### preferredTickWidthPx

> `readonly` **preferredTickWidthPx**: `number`

Defined in: model/errors.ts:126

***

### presetId

> `readonly` **presetId**: `string`

Defined in: model/errors.ts:124
