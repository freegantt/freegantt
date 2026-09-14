# Type Alias: VariantPredicate\<TProps\>

> **VariantPredicate**\<`TProps`\> = (`entry`) => `boolean`

Defined in: layout/items/variants.ts:49

A rule that reads the whole row. Call: `when: (entry) => entry.duration()?.value === 0`. It runs
 on the hover path, so keep it cheap: it answers a question and draws nothing.

## Type Parameters

### TProps

`TProps` = `Record`\<`string`, `unknown`\>

## Parameters

### entry

[`Entry`](../interfaces/Entry.md)\<`TProps`\>

## Returns

`boolean`
