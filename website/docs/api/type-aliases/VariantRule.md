# Type Alias: VariantRule\<TProps\>

> **VariantRule**\<`TProps`\> = [`FieldMatch`](FieldMatch.md)\<`TProps`\> \| [`VariantPredicate`](VariantPredicate.md)\<`TProps`\>

Defined in: layout/items/variants.ts:71

What `EntryVariant.when` takes: the field-match shorthand, or a predicate. Both ship (refuted
 item 7 in `plans/row-redesign/README.md`). The shorthand is what core can index — it names its
 keys — and the predicate answers everything the shorthand cannot.

## Type Parameters

### TProps

`TProps` = `Record`\<`string`, `unknown`\>
