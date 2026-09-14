# Interface: KeyBindingOf\<TGantt, TDataset\>

Defined in: api/command.ts:179

D-S5-7: newest-first resolution — the last registration gets first refusal, and a decline falls
 through to an older binding. `Mod` means `⌘` on Apple platforms and `Ctrl` elsewhere.

## Type Parameters

### TGantt

`TGantt` = `unknown`

### TDataset

`TDataset` = [`Dataset`](../classes/Dataset.md)

## Properties

### captureInEditable?

> `optional` **captureInEditable?**: `boolean`

Defined in: api/command.ts:186

Fire even while the event's target is editable or mid-IME-composition. Default `false`
 (issue #137 F7).

***

### chord

> **chord**: `string`

Defined in: api/command.ts:180

***

### command

> **command**: [`CommandId`](../type-aliases/CommandId.md)

Defined in: api/command.ts:181

## Methods

### when()?

> `optional` **when**(`ctx`): `boolean`

Defined in: api/command.ts:183

Extra condition beyond the command's own `when`.

#### Parameters

##### ctx

[`CommandContextOf`](CommandContextOf.md)\<`TGantt`, `TDataset`\>

#### Returns

`boolean`
