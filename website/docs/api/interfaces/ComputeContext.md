# Interface: ComputeContext

Defined in: model/field.ts:250

What a `compute` Field runs inside. Built per pass, bound to the row being computed, so **no
 member takes an entry argument** (ADR 0017, *What a hypothetical row reads with*). The row the
 pass holds may be one the store does not hold — a post-edit row, or a Rollup's effective child —
 which is why the pass answers these and `entry.read(key)` cannot.

## Extends

- [`FieldContext`](FieldContext.md)

## Extended by

- [`RollUpContext`](RollUpContext.md)

## Properties

### timeZone

> `readonly` **timeZone**: `string`

Defined in: model/field.ts:243

#### Inherited from

[`FieldContext`](FieldContext.md).[`timeZone`](FieldContext.md#timezone)

## Methods

### children()

> **children**(): readonly [`StoredEntry`](StoredEntry.md)\<`Record`\<`string`, `unknown`\>\>[]

Defined in: model/field.ts:256

The children of the row this pass is computing. It walks, so it carries parentheses.

#### Returns

readonly [`StoredEntry`](StoredEntry.md)\<`Record`\<`string`, `unknown`\>\>[]

***

### duration()

> **duration**(): [`Duration`](Duration.md) \| `undefined`

Defined in: model/field.ts:254

This row's duration, through `time/` and the Dataset's `measureDuration`.

#### Returns

[`Duration`](Duration.md) \| `undefined`

***

### hierarchyParentId()

> **hierarchyParentId**(): [`EntryId`](../type-aliases/EntryId.md) \| `undefined`

Defined in: model/field.ts:259

The tree's answer to this row's parent, through the checked hierarchy source (ADR 0020) — the
 same answer `entry.parent()?.id` gives, never `read('parentId')`'s stored value (ADR 0024).

#### Returns

[`EntryId`](../type-aliases/EntryId.md) \| `undefined`

***

### read()

> **read**\<`K`\>(`key`): [`CoreFieldValue`](../type-aliases/CoreFieldValue.md)\<`K`\> \| `undefined`

Defined in: model/field.ts:252

Another Field on this same row — a core key, `duration`, or another Field's `compute`.

#### Type Parameters

##### K

`K` *extends* [`FieldKey`](../type-aliases/FieldKey.md)

#### Parameters

##### key

`K`

#### Returns

[`CoreFieldValue`](../type-aliases/CoreFieldValue.md)\<`K`\> \| `undefined`
