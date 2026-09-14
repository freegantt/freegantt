# Type Alias: Aggregator\<TValue\>

> **Aggregator**\<`TValue`\> = (`parent`, `ctx`) => `TValue` \| `undefined`

Defined in: model/field.ts:309

Registered by name, never passed inline. `undefined` means no opinion — keep the stored value.

## Type Parameters

### TValue

`TValue` = `unknown`

## Parameters

### parent

[`StoredEntry`](../interfaces/StoredEntry.md)

### ctx

[`RollUpContext`](../interfaces/RollUpContext.md)

## Returns

`TValue` \| `undefined`
