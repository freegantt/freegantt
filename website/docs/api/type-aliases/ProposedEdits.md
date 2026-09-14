# Type Alias: ProposedEdits

> **ProposedEdits** = `ReadonlyMap`\<[`EntryId`](EntryId.md), [`ProposedEdit`](ProposedEdit.md)\>

Defined in: model/stored-entry.ts:199

A map of `ProposedEdit`s, keyed by the `EntryId` each one targets — what `EditRequest.proposed`
 carries, and what `entries.pendingEdits()` and a Draft (`layout/gesture-draft.ts`) hold.
