# Function: wholeEntryItem()

> **wholeEntryItem**(`entry`, `variant`): [`Item`](../interfaces/Item.md)

Defined in: layout/items/item.ts:127

One Item covering the entry's whole span — what almost every `ItemProducer` returns, and the
 default a variant with no `items` gets (ADR 0018). Public because the alternative is eight
 hand-written lines that must get the Item id convention right from documentation alone. Pure and
 DOM-free, like every other `layout/` function.

 Load-bearing cast (ADR 0012, Build 1, J2 in BUILD-LOG.md): a non-spanning Entry has no
 `start`/`end` to draw, so `produceItemsForRow` never calls any producer — shipped or a
 plugin's own — for one. `spansTime` is where that rule is written, and `produceItemsForRow`
 is where it runs. The contract, not the type, is why `entry.start`/`entry.end` are read here
 as if they were always present.

 This is the one cast Q5 left standing. The type fix is a narrower parameter — the Entry this
 takes always spans — and that is a public signature change, so it is owed rather than taken
 (N10 in plans/field-redesign/BUILD-LOG.md).

## Parameters

### entry

[`Entry`](../interfaces/Entry.md)

### variant

`string`

## Returns

[`Item`](../interfaces/Item.md)
