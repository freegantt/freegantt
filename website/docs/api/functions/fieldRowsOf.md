# Function: fieldRowsOf()

> **fieldRowsOf**(`changeSet`): readonly [`FieldUpdated`](../interfaces/FieldUpdated.md)[]

Defined in: data/change-set.ts:117

Call: `fieldRowsOf(changeSet).filter((row) => row.field === 'start')`.

The Field rows of a committed changeset. `ChangeSet.updated` also carries plugin-store rows since
D-S5-24, and a store row holds a whole value rather than a Field, so it has no `field` to read. A
consumer that only wants Field rows filters through this instead of re-deriving the `store` check.

## Parameters

### changeSet

[`ChangeSet`](../interfaces/ChangeSet.md)

## Returns

readonly [`FieldUpdated`](../interfaces/FieldUpdated.md)[]
