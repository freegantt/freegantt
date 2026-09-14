# Type Alias: ProposedEdit\<TProps\>

> **ProposedEdit**\<`TProps`\> = `object` & `Partial`\<`Omit`\<[`StoredEntry`](../interfaces/StoredEntry.md), `"id"` \| `"start"` \| `"end"` \| `"props"`\>\> & `object`

Defined in: model/stored-entry.ts:182

The **read** shape: an edit core has already read, with every date an `Instant` rather than a loose
 `InstantInput`, and every declared consumer key merged into a complete `props` (ADR 0011). Nobody
 outside core builds a `ProposedEdit`, and two callers read one differently (`plans/02`, two callers
 two surfaces):

 - An **app author** never meets it at all. They write an `EntryEdit` to `entries.update()`.
 - A **plugin author** reads one off `EditRequest.proposed`, and writes `EntryEdit`s back (#209).
   `moveEntryTo` builds one of those for them (D-S5-50).

 Core builds these on the way in — the extension hook's writes included, at one door
 (`DatasetState.extraEditsFor` → `toEditsReading`) — and `diffEdit` compares one against `entries`.

 **Decision 22 (ADR 0011), closed 2026-09-10: the whole type is branded, and it is *not* assignable
 to `EntryEdit`.** Before this ADR the asymmetry ran the other way — every `StoredEdit` was a legal
 `EntryEdit`. It stopped holding at `props`: a complete record and a patch are structurally the same
 shape, so a plugin author reading `request.proposed` off `EditRequest` could spread its `props`
 into a returned edit (`{ props: { ...request.proposed.get(id)?.props, risk: 'high' } }`) and turn
 every stored key into a proposed one by accident. `EntryEdit`'s own `props?: never` refuses that
 literal outright; the brand here refuses the object itself. A plugin author who wants one key off
 `proposed` writes one unwrap, never a spread.

 `proposedKeys` carries the Field keys the caller proposed. It is part of the edit, not a side
 channel — spread keeps it, and overlay never copies it onto an Entry.

## Type Declaration

### \_\_brand

> `readonly` **\_\_brand**: `"ProposedEdit"`

### proposedKeys

> `readonly` **proposedKeys**: `ReadonlySet`\<`string`\>

Never optional here: every `ProposedEdit` is built through `toEditReading`, which always seeds
 this set (`withProposedKeys`).

### props

> `readonly` **props**: `Readonly`\<`Partial`\<`TProps`\>\>

Always present and complete: `toEditReading` merges the patch onto the Entry's own `props`
 record on the read side.

## Type Declaration

### end?

> `optional` **end?**: [`Instant`](Instant.md)

### start?

> `optional` **start?**: [`Instant`](Instant.md)

## Type Parameters

### TProps

`TProps` = `Record`\<`string`, `unknown`\>
