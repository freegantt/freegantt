# Interface: PluginStoreView\<T\>

Defined in: model/plugin.ts:36

Another plugin's store, read-only (D-S5-30). Dropping `set`/`remove` is what makes ownership
 legible at the call site: a reviewer never has to check by hand which plugin a store call owns.

## Extended by

- [`PluginStore`](PluginStore.md)

## Type Parameters

### T

`T` *extends* `object`

## Properties

### all

> `readonly` **all**: `ReadonlyMap`\<[`EntryId`](../type-aliases/EntryId.md), `T`\>

Defined in: model/plugin.ts:38

## Methods

### get()

> **get**(`id`): `T` \| `undefined`

Defined in: model/plugin.ts:37

#### Parameters

##### id

`string` \| [`EntryId`](../type-aliases/EntryId.md)

#### Returns

`T` \| `undefined`
