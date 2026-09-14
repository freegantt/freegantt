# Function: entryIdOfItem()

> **entryIdOfItem**(`id`): [`EntryId`](../type-aliases/EntryId.md)

Defined in: model/ids.ts:75

Call: `dataset.entries.get(entryIdOfItem(hit.itemId))`. Splits on the last colon so an EntryId that
 itself contains a colon still round-trips with `itemId`.

## Parameters

### id

[`ItemId`](../type-aliases/ItemId.md)

## Returns

[`EntryId`](../type-aliases/EntryId.md)
