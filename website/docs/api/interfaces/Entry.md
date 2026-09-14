# Interface: Entry\<TProps\>

Defined in: model/entry.ts:28

One row, as it stands now.

**A member that does no work is a property. A member that computes, walks or allocates carries
parentheses** (ADR 0017, rule 4). So `hasChildren` and `depth` are properties, and `children()`,
`parent()`, `descendants()` and `duration()` are methods — `parent()` answers one value and still
carries parentheses, because it looks the row up.

There is no `entry.update()`: the `Entry` reads, and `dataset.entries.update(id, edit)` writes.
There is no `entry.variant`: a variant is per Gantt, because two Gantts on one Dataset may install
different ones. There is no `removed` flag: existence is `entries.has(id)`.

## Type Parameters

### TProps

`TProps` = `Record`\<`string`, `unknown`\>

## Properties

### depth

> `readonly` **depth**: `number`

Defined in: model/entry.ts:56

How many ancestors this row has. Read off a cached index, so it does no work here.

***

### end?

> `readonly` `optional` **end?**: [`Instant`](../type-aliases/Instant.md)

Defined in: model/entry.ts:34

Exclusive — see plans/01 §5. Omitted iff this Entry does not span (ADR 0012).

***

### hasChildren

> `readonly` **hasChildren**: `boolean`

Defined in: model/entry.ts:50

Free: a cached index read, no allocation.

***

### id

> `readonly` **id**: [`EntryId`](../type-aliases/EntryId.md)

Defined in: model/entry.ts:29

***

### name

> `readonly` **name**: `string`

Defined in: model/entry.ts:30

***

### segments

> `readonly` **segments**: readonly [`Segment`](Segment.md)[]

Defined in: model/entry.ts:35

***

### start?

> `readonly` `optional` **start?**: [`Instant`](../type-aliases/Instant.md)

Defined in: model/entry.ts:32

Omitted iff this Entry does not span (ADR 0012). Present with `end` iff it draws a bar.

## Methods

### children()

> **children**(): readonly `Entry`\<`TProps`\>[]

Defined in: model/entry.ts:51

#### Returns

readonly `Entry`\<`TProps`\>[]

***

### descendants()

> **descendants**(): readonly `Entry`\<`TProps`\>[]

Defined in: model/entry.ts:54

Every Entry below this one, deepest included. It walks, so it carries parentheses.

#### Returns

readonly `Entry`\<`TProps`\>[]

***

### duration()

> **duration**(): [`Duration`](Duration.md) \| `undefined`

Defined in: model/entry.ts:47

Core's sixth Field, computed from `start` and `end` through `time/` under the Dataset's own
 `measureDuration` policy. It allocates, so it carries parentheses. `undefined` iff this Entry
 does not span (ADR 0012) — never `NaN`.

#### Returns

[`Duration`](Duration.md) \| `undefined`

***

### parent()

> **parent**(): `Entry`\<`TProps`\> \| `undefined`

Defined in: model/entry.ts:52

#### Returns

`Entry`\<`TProps`\> \| `undefined`

***

### read()

> **read**\<`K`\>(`field`): [`FieldValue`](../type-aliases/FieldValue.md)\<`TProps`, `K`\> \| `undefined`

Defined in: model/entry.ts:42

The one by-key value door: a core key, a `props` key, or a `compute` Field. Every answer is
 live, and every answer is what its Field declares: a stored key answers the stored value,
 `'parentId'` included, and a `compute` key answers what it computes (ADR 0024). The tree has
 its own doors — `parent()` and `read('hierarchyParentId')` — because a plugin-owned hierarchy
 (ADR 0020) can make the tree disagree with the stored `parentId`, on purpose.

#### Type Parameters

##### K

`K` *extends* [`FieldKey`](../type-aliases/FieldKey.md)

#### Parameters

##### field

`K`

#### Returns

[`FieldValue`](../type-aliases/FieldValue.md)\<`TProps`, `K`\> \| `undefined`

***

### toInput()

> **toInput**(): [`EntryInput`](EntryInput.md)\<`TProps`\>

Defined in: model/entry.ts:61

The loose input shape, and exactly what `entries.add()` takes. It is how a row is copied:
 `entries.add({ ...entry.toInput(), id: 'copy-1' })`. It is not a second read door — nothing in
 a renderer, a rule or a capability calls it.

#### Returns

[`EntryInput`](EntryInput.md)\<`TProps`\>
