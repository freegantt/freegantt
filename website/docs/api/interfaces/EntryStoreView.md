# Interface: EntryStoreView\<TProps\>

Defined in: model/dataset.ts:20

The Dataset's own read view onto its entries (D-S2-2). Every row it hands back is a live `Entry`
 and answers for now (ADR 0017).

 **Two questions hide in one word.** *Which* rows exist is this collection's question, and `all`
 answers it as of the last commit — see D-S2-3 for its cached-identity rule and D-S2-21 for what
 it does *not* show while a transaction is open. *What a row is worth* is the row's own question,
 and every `Entry` in that array answers it now. `get`/`has`/`size` are the live membership
 doors.

## Extended by

- [`EntryStore`](EntryStore.md)

## Type Parameters

### TProps

`TProps` = `Record`\<`string`, `unknown`\>

## Properties

### all

> `readonly` **all**: readonly [`Entry`](Entry.md)\<`TProps`\>[]

Defined in: model/dataset.ts:21

***

### size

> `readonly` **size**: `number`

Defined in: model/dataset.ts:24

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

## Methods

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

***

### get()

> **get**(`id`): [`Entry`](Entry.md)\<`TProps`\> \| `undefined`

Defined in: model/dataset.ts:22

#### Parameters

##### id

`string` \| [`EntryId`](../type-aliases/EntryId.md)

#### Returns

[`Entry`](Entry.md)\<`TProps`\> \| `undefined`

***

### has()

> **has**(`id`): `boolean`

Defined in: model/dataset.ts:23

#### Parameters

##### id

`string` \| [`EntryId`](../type-aliases/EntryId.md)

#### Returns

`boolean`

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
