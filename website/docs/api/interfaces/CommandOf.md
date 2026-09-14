# Interface: CommandOf\<TGantt, TDataset\>

Defined in: api/command.ts:152

A named, invokable action with a label and a condition (D-S5-6). No `TArgs` generic — every
 invocation path in S5 is argument-less (issue #137 G); see the step file for why a generic here
 would be type-unsound at the registry boundary.

## Type Parameters

### TGantt

`TGantt` = `unknown`

### TDataset

`TDataset` = [`Dataset`](../classes/Dataset.md)

## Properties

### id

> **id**: [`CommandId`](../type-aliases/CommandId.md)

Defined in: api/command.ts:153

***

### label

> **label**: `string`

Defined in: api/command.ts:155

Menu text; also the a11y name.

## Methods

### run()

> **run**(`ctx`): `void`

Defined in: api/command.ts:158

#### Parameters

##### ctx

[`CommandContextOf`](CommandContextOf.md)\<`TGantt`, `TDataset`\>

#### Returns

`void`

***

### when()?

> `optional` **when**(`ctx`): `boolean`

Defined in: api/command.ts:157

Static availability. Absent means always available.

#### Parameters

##### ctx

[`CommandContextOf`](CommandContextOf.md)\<`TGantt`, `TDataset`\>

#### Returns

`boolean`
