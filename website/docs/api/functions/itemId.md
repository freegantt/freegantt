# Function: itemId()

> **itemId**(`entry`, `segmentIndex?`): [`ItemId`](../type-aliases/ItemId.md)

Defined in: model/ids.ts:39

Item.id = `${entryId}:${segmentIndex ?? 0}` — deterministic across layout passes (plans/01 §2.4).

## Parameters

### entry

[`EntryId`](../type-aliases/EntryId.md)

### segmentIndex?

`number` = `0`

## Returns

[`ItemId`](../type-aliases/ItemId.md)
