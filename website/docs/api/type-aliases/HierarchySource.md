# Type Alias: HierarchySource\<TProps\>

> **HierarchySource**\<`TProps`\> = (`entry`) => [`EntryId`](EntryId.md) \| `string` \| `undefined`

Defined in: model/hierarchy-source.ts:27

Which Entry is the parent of this one? `undefined` is a root.

**It reads a `StoredEntry`, never the live `Entry`** (ADR 0020). The live `Entry` answers
`parent()`, `children()`, `depth` and `descendants()`, and every one of those answers is built
from this function. A source handed a live `Entry` would ask the question it exists to answer.

Core's own source is `(entry) => entry.parentId`, registered like any other with no special claim
on the seam (D-S5-23).

One Entry in, one parent id out — never the whole dataset. Core inverts the answer into the child
index, so a query stays O(children + edits) instead of O(dataset).

A plain `string` is a legal answer, the way it is on every other way into the library: core brands
it. `TProps` types `entry.props`, so a source that reads a consumer key names that key's own type
— `ctx.hierarchy.setSource<PlannerProps>(…)`.

## Type Parameters

### TProps

`TProps` = `Record`\<`string`, `unknown`\>

## Parameters

### entry

[`StoredEntry`](../interfaces/StoredEntry.md)\<`TProps`\>

## Returns

[`EntryId`](EntryId.md) \| `string` \| `undefined`
