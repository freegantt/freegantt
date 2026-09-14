# Interface: Segment

Defined in: model/stored-entry.ts:11

One dated stretch of an Entry, and the unit the Selection holds (#212, ADR 0010). Interrupted
work stores several; an Entry that never mentioned one stores a single Segment over its own span,
filled at ingest, so every Entry reads the same way and no caller carries a "no segments" branch.
A Segment carries an id because a Selection, an undo and a `removeSegments` call all have to name
the same stretch after its siblings move — see `SegmentId`.

## Extends

- [`TimeSpan`](TimeSpan.md)

## Properties

### end

> **end**: [`Instant`](../type-aliases/Instant.md)

Defined in: model/time.ts:11

#### Inherited from

[`TimeSpan`](TimeSpan.md).[`end`](TimeSpan.md#end)

***

### id

> **id**: [`SegmentId`](../type-aliases/SegmentId.md)

Defined in: model/stored-entry.ts:12

***

### start

> **start**: [`Instant`](../type-aliases/Instant.md)

Defined in: model/time.ts:10

#### Inherited from

[`TimeSpan`](TimeSpan.md).[`start`](TimeSpan.md#start)
