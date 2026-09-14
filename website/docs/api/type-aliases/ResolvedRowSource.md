# Type Alias: ResolvedRowSource

> **ResolvedRowSource** = [`ResolvedEntriesRowSource`](../interfaces/ResolvedEntriesRowSource.md) \| [`ResolvedGroupRowSource`](../interfaces/ResolvedGroupRowSource.md) \| [`CustomRowSource`](../interfaces/CustomRowSource.md)

Defined in: layout/rows/row-source.ts:79

What `Gantt.rowSource` reads back (#248 S4-2): every key a `RowSource` may omit, filled with the
 default `layout/` already applies at consumption (`filterPolicyOf`, the entries source's own
 `tree` check) — so a consumer never has to know those defaults to read them. `'custom'` takes no
 `filter`/`sort`/`filterPolicy`/`tree` (D-S4-21), so it has nothing left to fill and reads back as
 the `CustomRowSource` a consumer authored.
