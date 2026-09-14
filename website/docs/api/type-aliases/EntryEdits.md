# Type Alias: EntryEdits

> **EntryEdits** = `ReadonlyMap`\<[`EntryId`](EntryId.md), [`EntryEdit`](EntryEdit.md)\>

Defined in: model/stored-entry.ts:206

What a plugin author writes: one `EntryEdit` per Entry, keyed by `EntryId` — exactly the object
 `dataset.entries.update(id, edit)` takes, loose dates included (#209). An `EditExtender` returns
 one, and `mergeEntryEdits` composes two. Core reads it into `ProposedEdits` at the hook boundary,
 through the same `toEditReading` every other write goes through, so an extender never normalizes a date
 and never states its own proposed keys.
