# Type Alias: FieldEditable

> **FieldEditable** = `"never"` \| `"api"` \| `"anywhere"`

Defined in: model/field.ts:27

How far a Field's value may change (ADR 0015). One key, two thresholds: the grid writes it only
 at `'anywhere'`, and `entries.update()` writes it at anything but `'never'`.

 - `'anywhere'` — the cell editor opens, a drag writes it, and `update()` writes it. The default.
 - `'api'` — `update()` writes it; the grid cell is dead. A value the app owns and the user does
   not type.
 - `'never'` — a lock. `update()` throws `FieldNotEditableError`.

 `true` and `false` are input-only aliases for `'anywhere'` and `'never'`, the same way
 `InstantInput` takes a string and stores an `Instant`. After ingest the stored Field holds this
 enum, so `dataset.fields.all` reads one word back.
