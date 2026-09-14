# Interface: EntryStore\<TProps\>

Defined in: model/dataset.ts:51

The Dataset's entries, read and write — `dataset.entries.add/update/remove`. Each
 mutator returns the entry as the store holds it after the call (branded id, resolved instants),
 never the input, and each auto-wraps itself in a transaction when none is already open (D-S2-8).

## Extends

- [`EntryStoreView`](EntryStoreView.md)\<`TProps`\>

## Type Parameters

### TProps

`TProps` = `Record`\<`string`, `unknown`\>

## Properties

### all

> `readonly` **all**: readonly [`Entry`](Entry.md)\<`TProps`\>[]

Defined in: model/dataset.ts:21

#### Inherited from

[`EntryStoreView`](EntryStoreView.md).[`all`](EntryStoreView.md#all)

***

### size

> `readonly` **size**: `number`

Defined in: model/dataset.ts:24

#### Inherited from

[`EntryStoreView`](EntryStoreView.md).[`size`](EntryStoreView.md#size)

***

### storedValues

> `readonly` **storedValues**: `ReadonlyMap`\<[`EntryId`](../type-aliases/EntryId.md), [`StoredEntry`](StoredEntry.md)\<`TProps`\>\>

Defined in: model/dataset.ts:32

The committed rows as **stored values**, keyed by id — what the edit pipeline carries (ADR
 0017, P4). A drag preview hands this straight to the extension hook as `EditRequest.entries`,
 which is committed-only by contract (D-S5-45). One map identity per commit, so a frame that
 reads it allocates nothing (I5).

 A reader asking what a row is worth **now** wants `get(id)` and the live `Entry`. This door
 exists for the one caller that must not read now: a cascade computing a delta.

#### Inherited from

[`EntryStoreView`](EntryStoreView.md).[`storedValues`](EntryStoreView.md#storedvalues)

## Methods

### add()

> **add**(`input`): [`Entry`](Entry.md)\<`TProps`\>

Defined in: model/dataset.ts:63

Declared Field keys sit flat at the top, the same shape `update()` takes (ADR 0011, Q15):
 `entries.add({ id, name, owner: 'Ali' })`. Nested `props` stays legal for a bag already held or
 a passenger key — naming one both there and at the top throws.

 Typed as plain `EntryInput<TProps>`, not the `& Partial<TProps>` intersection Q15's wording
 suggests: that intersection is uninhabitable by a named `EntryInput<TProps>[]` value once
 `TProps` defaults to an open record (`Partial<Record<string, unknown>>` demands an index
 signature `EntryInput` does not carry), which broke every fixture that pre-types its own array.
 Ingest itself still reads a flat declared key off any object at runtime — `propsFromInput`
 (`entry-reader.ts`) does not consult this type — so a caller loses only the static
 autocomplete/check, not the behaviour. Flagged for the author (BUILD-LOG Q).

#### Parameters

##### input

[`EntryInput`](EntryInput.md)\<`TProps`\>

#### Returns

[`Entry`](Entry.md)\<`TProps`\>

***

### entryIdOfSegment()

> **entryIdOfSegment**(`id`): [`EntryId`](../type-aliases/EntryId.md) \| `undefined`

Defined in: model/dataset.ts:35

The Entry that draws `id`, or `undefined` when no Entry does (ADR 0010, #212). Call:
 `dataset.entries.entryIdOfSegment(segmentId)`.

#### Parameters

##### id

`string` \| [`SegmentId`](../type-aliases/SegmentId.md)

#### Returns

[`EntryId`](../type-aliases/EntryId.md) \| `undefined`

#### Inherited from

[`EntryStoreView`](EntryStoreView.md).[`entryIdOfSegment`](EntryStoreView.md#entryidofsegment)

***

### entryIdsOfSegments()

> **entryIdsOfSegments**(`ids`): readonly [`EntryId`](../type-aliases/EntryId.md)[]

Defined in: model/dataset.ts:38

Every Entry named by at least one id in `ids`, deduped, in the order first named (ADR 0010,
 #212). Call: `dataset.entries.entryIdsOfSegments(selection)`.

#### Parameters

##### ids

readonly (`string` \| [`SegmentId`](../type-aliases/SegmentId.md))[]

#### Returns

readonly [`EntryId`](../type-aliases/EntryId.md)[]

#### Inherited from

[`EntryStoreView`](EntryStoreView.md).[`entryIdsOfSegments`](EntryStoreView.md#entryidsofsegments)

***

### get()

> **get**(`id`): [`Entry`](Entry.md)\<`TProps`\> \| `undefined`

Defined in: model/dataset.ts:22

#### Parameters

##### id

`string` \| [`EntryId`](../type-aliases/EntryId.md)

#### Returns

[`Entry`](Entry.md)\<`TProps`\> \| `undefined`

#### Inherited from

[`EntryStoreView`](EntryStoreView.md).[`get`](EntryStoreView.md#get)

***

### has()

> **has**(`id`): `boolean`

Defined in: model/dataset.ts:23

#### Parameters

##### id

`string` \| [`EntryId`](../type-aliases/EntryId.md)

#### Returns

`boolean`

#### Inherited from

[`EntryStoreView`](EntryStoreView.md).[`has`](EntryStoreView.md#has)

***

### remove()

> **remove**(`id`): `void`

Defined in: model/dataset.ts:65

#### Parameters

##### id

`string` \| [`EntryId`](../type-aliases/EntryId.md)

#### Returns

`void`

***

### removeSegments()

> **removeSegments**(`ids`): `void`

Defined in: model/dataset.ts:69

Removes Segments in one transaction, across several Entries when `ids` names several (ADR
 0010, #212). An Entry that keeps a Segment gets its envelope recomputed; an Entry whose last
 Segment this removes is removed with it, in the same transaction.

#### Parameters

##### ids

readonly (`string` \| [`SegmentId`](../type-aliases/SegmentId.md))[]

#### Returns

`void`

***

### segmentIdsOfEntries()

> **segmentIdsOfEntries**(`ids`): readonly [`SegmentId`](../type-aliases/SegmentId.md)[]

Defined in: model/dataset.ts:45

Every Segment id these Entries draw, deduped, each Entry named once in the order first named,
 and each Entry's own Segments in Entry order (ADR 0010, #212, finding 10) — the pair to
 `entryIdsOfSegments`, which dedupes the same way, and the published way to select an Entry:
 `gantt.selectedSegmentIds = dataset.entries.segmentIdsOfEntries([id])`. An id no Entry currently
 draws, or an Entry already named, contributes nothing. Call:
 `dataset.entries.segmentIdsOfEntries(ids)`.

#### Parameters

##### ids

readonly (`string` \| [`EntryId`](../type-aliases/EntryId.md))[]

#### Returns

readonly [`SegmentId`](../type-aliases/SegmentId.md)[]

#### Inherited from

[`EntryStoreView`](EntryStoreView.md).[`segmentIdsOfEntries`](EntryStoreView.md#segmentidsofentries)

***

### update()

> **update**(`id`, `edit`): [`Entry`](Entry.md)\<`TProps`\>

Defined in: model/dataset.ts:64

#### Parameters

##### id

`string` \| [`EntryId`](../type-aliases/EntryId.md)

##### edit

[`EntryEdit`](../type-aliases/EntryEdit.md)\<`TProps`\>

#### Returns

[`Entry`](Entry.md)\<`TProps`\>
