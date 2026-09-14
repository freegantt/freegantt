# Type Alias: RowFilter

> **RowFilter** = (`entry`) => `boolean`

Defined in: layout/rows/row-source.ts:10

Does this row stay? The row answers its own questions — `entry.read('team')`, `entry.hasChildren`
 — so nothing rides beside it (ADR 0017).

## Parameters

### entry

[`Entry`](../interfaces/Entry.md)

## Returns

`boolean`
