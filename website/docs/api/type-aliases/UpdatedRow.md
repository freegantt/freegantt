# Type Alias: UpdatedRow

> **UpdatedRow** = [`FieldUpdated`](../interfaces/FieldUpdated.md) \| [`StoreRowUpdated`](../interfaces/StoreRowUpdated.md)

Defined in: model/change-set.ts:50

What `ChangeSet.updated` holds. Read `row.store === 'entries'` to tell the two apart — a consumer
 that only wants Field rows filters on it, and TypeScript narrows to `FieldUpdated` from there.
