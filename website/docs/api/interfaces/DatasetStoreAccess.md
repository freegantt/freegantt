# Interface: DatasetStoreAccess

Defined in: api/dataset-plugin.ts:92

This plugin's own store, plus a read-only view of anybody else's (D-S5-24, D-S5-30).

## Methods

### read()

> **read**\<`T`\>(`pluginId`): [`PluginStoreView`](PluginStoreView.md)\<`T`\> \| `undefined`

Defined in: api/dataset-plugin.ts:97

Any other plugin's store, read-only. `undefined` if that plugin never reserved one.

#### Type Parameters

##### T

`T` *extends* `object`

#### Parameters

##### pluginId

`string`

#### Returns

[`PluginStoreView`](PluginStoreView.md)\<`T`\> \| `undefined`

***

### reserve()

> **reserve**\<`T`\>(): [`PluginStore`](PluginStore.md)\<`T`\>

Defined in: api/dataset-plugin.ts:95

This plugin's own reserved store, namespaced by its id. Idempotent: a second call returns the
 same handle.

#### Type Parameters

##### T

`T` *extends* `object`

#### Returns

[`PluginStore`](PluginStore.md)\<`T`\>
