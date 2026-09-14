# Interface: SegmentInput

Defined in: model/stored-entry.ts:17

What a consumer writes for one Segment. The id is theirs to name and optional: an omitted id is
minted at ingest from the Dataset's own counter. `Segment` is itself a valid `SegmentInput`.

## Extends

- [`TimeSpanInput`](TimeSpanInput.md)

## Properties

### end

> **end**: [`InstantInput`](../type-aliases/InstantInput.md)

Defined in: model/time.ts:63

#### Inherited from

[`TimeSpanInput`](TimeSpanInput.md).[`end`](TimeSpanInput.md#end)

***

### id?

> `optional` **id?**: `string`

Defined in: model/stored-entry.ts:18

***

### start

> **start**: [`InstantInput`](../type-aliases/InstantInput.md)

Defined in: model/time.ts:62

#### Inherited from

[`TimeSpanInput`](TimeSpanInput.md).[`start`](TimeSpanInput.md#start)
