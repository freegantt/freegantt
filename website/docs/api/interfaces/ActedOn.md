# Interface: ActedOn

Defined in: api/command.ts:65

What one invocation acts on (ADR 0010, issue #212) — the two readings of one set. `entryIds` is a
 projection of `segmentIds`: the Entries those Segments belong to, deduped, in row order. Both are
 always present, so a command reads whichever one it needs and the two can never disagree. No
 command declares its reach: Delete reads `segmentIds`, and Lock reads `entryIds`, because a lock
 is a property of the record and not of one drawing of it.

## Extended by

- [`CommandTarget`](CommandTarget.md)

## Properties

### entryIds

> **entryIds**: readonly [`EntryId`](../type-aliases/EntryId.md)[]

Defined in: api/command.ts:67

***

### segmentIds

> **segmentIds**: readonly [`SegmentId`](../type-aliases/SegmentId.md)[]

Defined in: api/command.ts:66
