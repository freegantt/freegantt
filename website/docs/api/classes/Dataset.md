# Class: Dataset\<TProps\>

Defined in: api/dataset.ts:124

## Type Parameters

### TProps

`TProps` = `unknown`

## Constructors

### Constructor

> **new Dataset**\<`TProps`\>(`options`): `Dataset`\<`TProps`\>

Defined in: api/dataset.ts:130

#### Parameters

##### options

[`DatasetOptions`](../interfaces/DatasetOptions.md)\<`TProps`\>

#### Returns

`Dataset`\<`TProps`\>

## Accessors

### canRedo

#### Get Signature

> **get** **canRedo**(): `boolean`

Defined in: api/dataset.ts:283

`true` while there is an undone changeset `redo()` can re-apply.

##### Returns

`boolean`

***

### canUndo

#### Get Signature

> **get** **canUndo**(): `boolean`

Defined in: api/dataset.ts:278

`true` while there is a committed changeset `undo()` can reverse.

##### Returns

`boolean`

***

### datasetRevision

#### Get Signature

> **get** **datasetRevision**(): `number`

Defined in: api/dataset.ts:256

A counter that rises once per committed change. Call: `if (dataset.datasetRevision !== seen)`
 — read it to answer "has anything changed since I last looked?" without diffing entries.

 A consumer reads this and never passes it anywhere. The library keeps its own caches fresh
 from it internally, so nothing an app author writes has to carry it.

##### Returns

`number`

***

### dateOnlyEnd

#### Get Signature

> **get** **dateOnlyEnd**(): [`DateOnlyEndRule`](../type-aliases/DateOnlyEndRule.md)

Defined in: api/dataset.ts:223

##### Returns

[`DateOnlyEndRule`](../type-aliases/DateOnlyEndRule.md)

***

### entries

#### Get Signature

> **get** **entries**(): [`EntryStore`](../interfaces/EntryStore.md)\<`TProps`\>

Defined in: api/dataset.ts:208

##### Returns

[`EntryStore`](../interfaces/EntryStore.md)\<`TProps`\>

***

### fields

#### Get Signature

> **get** **fields**(): `object`

Defined in: api/dataset.ts:235

Resolved Field declarations this Dataset owns, core Fields included (D-S4-1), each after its
 named `type` bundle merges in.

##### Returns

`object`

###### all

> `readonly` **all**: readonly [`Field`](../type-aliases/Field.md)[]

***

### plugins

#### Get Signature

> **get** **plugins**(): readonly [`PluginOf`](../type-aliases/PluginOf.md)\<`unknown`, `Dataset`\<`TProps`\>\>[]

Defined in: api/dataset.ts:197

The plugins this Dataset installed, in the order the caller wrote them. Read-only — see
 `DatasetOptions.plugins` for why a Dataset cannot take a new set after construction.

##### Returns

readonly [`PluginOf`](../type-aliases/PluginOf.md)\<`unknown`, `Dataset`\<`TProps`\>\>[]

***

### time

#### Get Signature

> **get** **time**(): [`ZonedTime`](../interfaces/ZonedTime.md)

Defined in: api/dataset.ts:219

Zone-aware date math bound to this Dataset's own zone (D-S5-16) — the one way a plugin author
 reaches `time/` (the `exports` map seals it against a direct import). Call:
 `dataset.time.eachDay(span).filter((day) => dataset.time.dayOfWeek(day) >= 6)`.

##### Returns

[`ZonedTime`](../interfaces/ZonedTime.md)

***

### timeZone

#### Get Signature

> **get** **timeZone**(): `string`

Defined in: api/dataset.ts:212

##### Returns

`string`

## Methods

### destroy()

> **destroy**(): `void`

Defined in: api/dataset.ts:203

Releases every installed `data` half, in reverse setup order. A Dataset with no plugins needs no
 `destroy()` call — nothing holds a resource.

#### Returns

`void`

***

### field()

> **field**(`key`): [`Field`](../type-aliases/Field.md) \| `undefined`

Defined in: api/dataset.ts:229

The resolved Field for this key, or `undefined` when the key is not declared. This is the
 declaration, not an Entry value; `entry.read(key)` reads the value.

#### Parameters

##### key

[`FieldKey`](../type-aliases/FieldKey.md)

#### Returns

[`Field`](../type-aliases/Field.md) \| `undefined`

***

### off()

> **off**\<`K`\>(`name`, `handler`): `void`

Defined in: api/dataset.ts:270

#### Type Parameters

##### K

`K` *extends* keyof [`DatasetEventMap`](../interfaces/DatasetEventMap.md)

#### Parameters

##### name

`K`

##### handler

(`payload`) => `false` \| `void`

#### Returns

`void`

***

### on()

> **on**\<`K`\>(`name`, `handler`): `void`

Defined in: api/dataset.ts:266

#### Type Parameters

##### K

`K` *extends* keyof [`DatasetEventMap`](../interfaces/DatasetEventMap.md)

#### Parameters

##### name

`K`

##### handler

(`payload`) => `false` \| `void`

#### Returns

`void`

***

### pluginStore()

#### Call Signature

> **pluginStore**\<`T`\>(`pluginId`): [`PluginStoreView`](../interfaces/PluginStoreView.md)\<`T`\> \| `undefined`

Defined in: api/dataset.ts:317

Call: `dataset.pluginStore('acme/locks')` — one plugin's rows, read-only, or `undefined` when
 that plugin never reserved a store. `dataset.pluginStore()` with no argument answers every store
 this Dataset holds, as a record keyed by plugin id: `Object.entries(dataset.pluginStore())`.

 A plugin's own data is not on this Dataset until that plugin installs and reserves a store — no
 door takes rows in ahead of that (ADR 0016). An application that must keep a plugin's data saves
 it by reading this, and restores it through the plugin's own API after re-installing the plugin.

##### Type Parameters

###### T

`T` *extends* `object`

##### Parameters

###### pluginId

`string`

##### Returns

[`PluginStoreView`](../interfaces/PluginStoreView.md)\<`T`\> \| `undefined`

#### Call Signature

> **pluginStore**(): `Readonly`\<`Record`\<[`PluginId`](../type-aliases/PluginId.md), [`PluginStoreView`](../interfaces/PluginStoreView.md)\<`object`\>\>\>

Defined in: api/dataset.ts:318

Call: `dataset.pluginStore('acme/locks')` — one plugin's rows, read-only, or `undefined` when
 that plugin never reserved a store. `dataset.pluginStore()` with no argument answers every store
 this Dataset holds, as a record keyed by plugin id: `Object.entries(dataset.pluginStore())`.

 A plugin's own data is not on this Dataset until that plugin installs and reserves a store — no
 door takes rows in ahead of that (ADR 0016). An application that must keep a plugin's data saves
 it by reading this, and restores it through the plugin's own API after re-installing the plugin.

##### Returns

`Readonly`\<`Record`\<[`PluginId`](../type-aliases/PluginId.md), [`PluginStoreView`](../interfaces/PluginStoreView.md)\<`object`\>\>\>

***

### redo()

> **redo**(): `void`

Defined in: api/dataset.ts:295

Re-applies the most recently undone changeset. A no-op when `canRedo` is `false`.

#### Returns

`void`

***

### replay()

> **replay**(`changeSet`): `void`

Defined in: api/dataset.ts:306

Applies an already-complete `ChangeSet` exactly as given — no extension hook, no rollup
 (`plans/s2-data-core/s2b-undo-replay-seam.md`). `changeSet.origin` must be `'undo'` or `'redo'`;
 `'user'` throws `InvalidReplayOriginError` — that door is `apply`, later (D-S2-11). An empty
 changeset is a no-op: no event, no throw. `beforeChange` then `change` still fire, and a veto
 throws `MutationCancelledError` and writes nothing. This is the write path `undo()`/`redo()` use;
 a consumer History can now be written against this method alone, plus `invertChangeSet` and
 `on('change')`.

#### Parameters

##### changeSet

[`ChangeSet`](../interfaces/ChangeSet.md)

#### Returns

`void`

***

### setFieldEditable()

> **setFieldEditable**(`key`, `editable`): `void`

Defined in: api/dataset.ts:247

Call: `dataset.setFieldEditable('start', 'never')` — "set Field start editable to never."

 The Field *set* is fixed after construction; this one attribute is not (ADR 0015). It changes a
 Field the Dataset already declares and adds none, so an unknown key throws `UnknownFieldError`.
 `true` and `false` still alias `'anywhere'` and `'never'`.

 Which Entry a value is writable *on* is `gantt.interactions.edit`, per row. This key states
 which values are writable at all.

#### Parameters

##### key

[`FieldKey`](../type-aliases/FieldKey.md)

##### editable

`boolean` \| [`FieldEditable`](../type-aliases/FieldEditable.md)

#### Returns

`void`

***

### transaction()

> **transaction**\<`T`\>(`body`): `T`

Defined in: api/dataset.ts:262

Batches `body`'s mutations into one changeset (D-S2-8). Nested calls join the open transaction.
 `'user'` is the only origin a public caller can produce in S2.

#### Type Parameters

##### T

`T`

#### Parameters

##### body

() => `T`

#### Returns

`T`

***

### undo()

> **undo**(): `void`

Defined in: api/dataset.ts:290

Reverts the most recent undoable changeset (`plans/s2-data-core/s2.5-undo-redo.md` §1). A no-op
 when `canUndo` is `false`. What it did arrives on `on('change')`, like every other commit — a
 refused undo throws `MutationCancelledError` and leaves the history exactly where it was.

#### Returns

`void`
