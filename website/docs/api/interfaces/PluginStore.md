# Interface: PluginStore\<T\>

Defined in: model/plugin.ts:47

A plugin's own per-entry data, namespaced by that plugin's id (D-S5-24). It is a real store, not a
side map: a write joins the open transaction, lands in the same `ChangeSet` as the entry edit, and
one undo step covers both (I7). A write with no transaction open wraps itself in one, the rule
`entries.add` already follows.

## Extends

- [`PluginStoreView`](PluginStoreView.md)\<`T`\>

## Type Parameters

### T

`T` *extends* `object`

## Properties

### all

> `readonly` **all**: `ReadonlyMap`\<[`EntryId`](../type-aliases/EntryId.md), `T`\>

Defined in: model/plugin.ts:38

#### Inherited from

[`PluginStoreView`](PluginStoreView.md).[`all`](PluginStoreView.md#all)

## Methods

### get()

> **get**(`id`): `T` \| `undefined`

Defined in: model/plugin.ts:37

#### Parameters

##### id

`string` \| [`EntryId`](../type-aliases/EntryId.md)

#### Returns

`T` \| `undefined`

#### Inherited from

[`PluginStoreView`](PluginStoreView.md).[`get`](PluginStoreView.md#get)

***

### remove()

> **remove**(`id`): `void`

Defined in: model/plugin.ts:49

#### Parameters

##### id

`string` \| [`EntryId`](../type-aliases/EntryId.md)

#### Returns

`void`

***

### set()

> **set**(`id`, `value`): `void`

Defined in: model/plugin.ts:48

#### Parameters

##### id

`string` \| [`EntryId`](../type-aliases/EntryId.md)

##### value

`T`

#### Returns

`void`
