# Function: invertChangeSet()

> **invertChangeSet**(`changeSet`): [`ChangeSet`](../interfaces/ChangeSet.md)

Defined in: data/change-set.ts:148

Undo's recorded changeset, inverted: `added`↔`removed`, each `updated` row's `from`/`to` swapped,
 `origin: 'undo'`. Redo does not invert — it re-applies the recorded rows with `origin: 'redo'`. The
 `id` carried over is a placeholder only — `replay` mints a fresh one and ignores this one
 (`plans/s2-data-core/s2b-undo-replay-seam.md`).

## Parameters

### changeSet

[`ChangeSet`](../interfaces/ChangeSet.md)

## Returns

[`ChangeSet`](../interfaces/ChangeSet.md)
