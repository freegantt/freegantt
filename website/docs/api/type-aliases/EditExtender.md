# Type Alias: EditExtender

> **EditExtender** = (`request`) => [`EntryEdits`](EntryEdits.md)

Defined in: model/stored-entry.ts:246

Extra writes only; an empty map means no cascade. Lives in `model/` (not `data/`) so
 `ExtenderWrapper` — the type a plugin author writes against — can name it (D-S5-23).

 What it returns is read by the same rules `dataset.entries.update(id, edit)` obeys (#209): a Field
 no Dataset declares is refused (`UnknownFieldError`), and an edit that moves `start`/`end` on an
 Entry with several Segments without restating `segments` is refused too (`SegmentsOutOfSyncError`,
 D-S5-44) — `moveEntryTo` writes that move. An id nothing in the transaction knows is skipped.

## Parameters

### request

[`EditRequest`](../interfaces/EditRequest.md)

## Returns

[`EntryEdits`](EntryEdits.md)
