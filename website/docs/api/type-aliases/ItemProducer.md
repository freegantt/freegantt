# Type Alias: ItemProducer

> **ItemProducer** = (`entry`, `variant`) => readonly [`Item`](../interfaces/Item.md)[]

Defined in: layout/items/item.ts:62

What shape one variant draws. `EntryVariant.items` takes one. Omit it and the variant draws
 `followSegments`, the registry's own default (ADR 0023). One Item per Segment, or one Item
 over the whole span when the Entry has none.

 **Takes the variant's own name.** A variant states its name once (ADR 0018), so the registry
 passes its own registration's name here instead of a producer inventing or hardcoding one — the
 Item then carries that name straight to `data-variant`. A one-argument producer an author already
 wrote keeps compiling: TypeScript accepts a function that takes fewer parameters than its
 declared type.

## Parameters

### entry

[`Entry`](../interfaces/Entry.md)

### variant

`string`

## Returns

readonly [`Item`](../interfaces/Item.md)[]
