# Interface: CoreFieldValues

Defined in: model/field-key.ts:23

What each shipped Field reads as: the `Entry` keys (minus `props`, ADR 0011's one reserved key),
 plus `duration` — the one core Field that computes its value and owns no `Entry` key
 (`data/fields/core-fields.ts`). The typed way to a consumer's own `props` is
 `entries.get(id)?.props`.

## Extends

- `Omit`\<[`StoredEntry`](StoredEntry.md), `"id"` \| `"props"`\>

## Properties

### duration

> **duration**: [`Duration`](Duration.md)

Defined in: model/field-key.ts:28

This row's duration under the Dataset's `measureDuration`, computed on read (`CORE_FIELDS`) —
 the one core Field with no `Entry` key. `measureEntryDuration` (`data/fields/field-access.ts`)
 is the one computation all three doors reach: `'span'` measures `end - start`, and
 `'segments'` sums the Segments and counts no gap (ADR 0017).

***

### end?

> `optional` **end?**: [`Instant`](../type-aliases/Instant.md)

Defined in: model/stored-entry.ts:43

Exclusive — see plans/01 §5. Omitted iff this Entry does not span (ADR 0012); see `start`.

#### Inherited from

`Omit.end`

***

### hierarchyParentId

> **hierarchyParentId**: [`EntryId`](../type-aliases/EntryId.md) \| `undefined`

Defined in: model/field-key.ts:32

The tree's answer to "who is this row's parent", by key (ADR 0024) — the same answer
 `parent()?.id` gives, computed on read, never stored. `parentId` stays the authored value; a
 plugin-owned hierarchy source can make the two disagree, on purpose (ADR 0020).

***

### name

> **name**: `string`

Defined in: model/stored-entry.ts:38

What this row is called. Core reads it for the Grid's default label and for nothing else.

#### Inherited from

`Omit.name`

***

### parentId?

> `optional` **parentId?**: [`EntryId`](../type-aliases/EntryId.md)

Defined in: model/stored-entry.ts:36

Hierarchy; roots have none. An Entry has no stored classification (ADR 0013): it derives when
 it has children, and `Entry.hasChildren` is what answers that.

#### Inherited from

`Omit.parentId`

***

### segments

> **segments**: readonly [`Segment`](Segment.md)[]

Defined in: model/stored-entry.ts:48

Every stretch this Entry draws. Empty when the Entry does not span (ADR 0012, revises #212's
"never empty"). A spanning Entry stores at least one Segment: interrupted work stores several
bars on one row; everything else stores the single Segment ingest filled in over `[start, end)`.
`start` and `end` stay the envelope over all of them.

#### Inherited from

`Omit.segments`

***

### start?

> `optional` **start?**: [`Instant`](../type-aliases/Instant.md)

Defined in: model/stored-entry.ts:41

Omitted iff this Entry does not span (ADR 0012). Present with `end` if and only if it holds a
Segment and draws a bar.

#### Inherited from

`Omit.start`
