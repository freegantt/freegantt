# Function: changeSetId()

> **changeSetId**(`counter`): [`ChangeSetId`](../type-aliases/ChangeSetId.md)

Defined in: model/ids.ts:34

Minted from a Dataset's own per-instance counter (never module-level state, I2) — not a sync
token, just identity two writers never need to agree on (plans/s2-data-core/README.md D-S2-7).

## Parameters

### counter

`number`

## Returns

[`ChangeSetId`](../type-aliases/ChangeSetId.md)
