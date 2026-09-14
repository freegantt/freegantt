# Interface: RollUpContext

Defined in: model/field.ts:274

ComputeContext plus the Field currently rolling up. Shipped Aggregators (`sum`, `min`) read
 `ctx.field`; a consumer Aggregator names any declared key.

 `values`/`numericValues` cover the common "one field off my children" case (issue #124) — they
 read the pass's own child list, never `parent.children()`, because a Rollup child carries the
 value this same bottom-up pass just gave it and the store does not (ADR 0017).

## Extends

- [`ComputeContext`](ComputeContext.md)

## Properties

### field

> `readonly` **field**: [`FieldKey`](../type-aliases/FieldKey.md)

Defined in: model/field.ts:275

***

### timeZone

> `readonly` **timeZone**: `string`

Defined in: model/field.ts:243

#### Inherited from

[`ComputeContext`](ComputeContext.md).[`timeZone`](ComputeContext.md#timezone)

## Methods

### children()

> **children**(): readonly [`StoredEntry`](StoredEntry.md)\<`Record`\<`string`, `unknown`\>\>[]

Defined in: model/field.ts:256

The children of the row this pass is computing. It walks, so it carries parentheses.

#### Returns

readonly [`StoredEntry`](StoredEntry.md)\<`Record`\<`string`, `unknown`\>\>[]

#### Inherited from

[`ComputeContext`](ComputeContext.md).[`children`](ComputeContext.md#children)

***

### duration()

> **duration**(): [`Duration`](Duration.md) \| `undefined`

Defined in: model/field.ts:254

This row's duration, through `time/` and the Dataset's `measureDuration`.

#### Returns

[`Duration`](Duration.md) \| `undefined`

#### Inherited from

[`ComputeContext`](ComputeContext.md).[`duration`](ComputeContext.md#duration)

***

### durations()

> **durations**(): readonly ([`Duration`](Duration.md) \| `undefined`)[]

Defined in: model/field.ts:283

Each child's duration, in the same order — what `weightedMeanByDuration` weighs with.

#### Returns

readonly ([`Duration`](Duration.md) \| `undefined`)[]

***

### hierarchyParentId()

> **hierarchyParentId**(): [`EntryId`](../type-aliases/EntryId.md) \| `undefined`

Defined in: model/field.ts:259

The tree's answer to this row's parent, through the checked hierarchy source (ADR 0020) — the
 same answer `entry.parent()?.id` gives, never `read('parentId')`'s stored value (ADR 0024).

#### Returns

[`EntryId`](../type-aliases/EntryId.md) \| `undefined`

#### Inherited from

[`ComputeContext`](ComputeContext.md).[`hierarchyParentId`](ComputeContext.md#hierarchyparentid)

***

### numericValues()

> **numericValues**(`key?`): readonly `number`[]

Defined in: model/field.ts:281

Like `values`, but keeps only finite numbers — holes and non-numeric values drop, same rule
 shipped `sum`/`min`/`max` already follow.

#### Parameters

##### key?

[`FieldKey`](../type-aliases/FieldKey.md)

#### Returns

readonly `number`[]

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

#### Inherited from

[`ComputeContext`](ComputeContext.md).[`read`](ComputeContext.md#read)

***

### values()

> **values**(`key?`): readonly `unknown`[]

Defined in: model/field.ts:278

`key` read off each child, in order, defaulting to `ctx.field`. A child with no value is a
 hole (`undefined`).

#### Parameters

##### key?

[`FieldKey`](../type-aliases/FieldKey.md)

#### Returns

readonly `unknown`[]
