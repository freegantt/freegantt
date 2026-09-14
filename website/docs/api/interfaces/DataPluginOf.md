# Interface: DataPluginOf\<TViewContext, TDataset\>

Defined in: api/plugin.ts:54

A plugin that owns state — Fields, the edit hook, a store — and may paint it too.

 **The install site is where the state lives.** This arm installs on the `Dataset`, because a Field
 must exist before the first Rollup (D-S5-4). Every `Gantt` bound to that Dataset then runs `view`
 once, each with its own context, so I2 holds by construction.

## Extends

- [`PluginIdentity`](PluginIdentity.md)

## Type Parameters

### TViewContext

`TViewContext` = `unknown`

### TDataset

`TDataset` = `unknown`

## Properties

### id

> **id**: `string`

Defined in: api/plugin.ts:26

#### Inherited from

[`PluginIdentity`](PluginIdentity.md).[`id`](PluginIdentity.md#id)

***

### requires?

> `optional` **requires?**: readonly `string`[]

Defined in: api/plugin.ts:31

Plugin ids that must also be installed. Does not imply an order in the array: installation
 resolves setup order from `requires` alone, so `[a, b]` and `[b, a]` install identically
 (D-S5-31). A required id nobody installs throws `MissingPluginError`. One list covers both
 halves (ADR 0019).

#### Inherited from

[`PluginIdentity`](PluginIdentity.md).[`requires`](PluginIdentity.md#requires)

## Methods

### data()

> **data**(`ctx`): `void` \| [`Disposer`](../type-aliases/Disposer.md)

Defined in: api/plugin.ts:56

Fields, the edit hook and the store. DOM-free, and runs as the `Dataset` constructs.

#### Parameters

##### ctx

[`DatasetPluginContextOf`](DatasetPluginContextOf.md)\<`TDataset`\>

#### Returns

`void` \| [`Disposer`](../type-aliases/Disposer.md)

***

### view()?

> `optional` **view**(`ctx`): `void` \| [`Disposer`](../type-aliases/Disposer.md)

Defined in: api/plugin.ts:58

The same half a chrome-only plugin fills. Optional: a headless plugin paints nothing.

#### Parameters

##### ctx

`TViewContext`

#### Returns

`void` \| [`Disposer`](../type-aliases/Disposer.md)
