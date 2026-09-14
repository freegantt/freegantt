# Interface: DatasetEvents

Defined in: api/dataset-plugin.ts:50

`beforeChange`/`change`, the two events a Dataset raises (D-S2-5, D-S2-25). Returning `false` from a
 `beforeChange` handler vetoes the whole changeset — the refusal path a lock plugin uses (D-S5-24).

## Methods

### off()

> **off**\<`K`\>(`name`, `handler`): `void`

Defined in: api/dataset-plugin.ts:52

#### Type Parameters

##### K

`K` *extends* keyof [`DatasetEventMap`](DatasetEventMap.md)

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

Defined in: api/dataset-plugin.ts:51

#### Type Parameters

##### K

`K` *extends* keyof [`DatasetEventMap`](DatasetEventMap.md)

#### Parameters

##### name

`K`

##### handler

(`payload`) => `false` \| `void`

#### Returns

`void`
