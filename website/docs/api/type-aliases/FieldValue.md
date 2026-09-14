# Type Alias: FieldValue\<TProps, K\>

> **FieldValue**\<`TProps`, `K`\> = `K` *extends* keyof [`CoreFieldValues`](../interfaces/CoreFieldValues.md) ? [`CoreFieldValues`](../interfaces/CoreFieldValues.md)\[`K`\] : `K` *extends* keyof `TProps` ? `TProps`\[`K`\] : `unknown`

Defined in: model/field-key.ts:46

A Field's value on a Dataset that declared `TProps` — what `entry.read(key)` answers. A core
 key reads as its shipped type, a declared key as the type the consumer wrote, and any other key
 as `unknown`. One generic types both `entry.props` and this (ADR 0011); `TProps` stops at the
 Dataset (ADR 0005).

## Type Parameters

### TProps

`TProps`

### K

`K` *extends* [`FieldKey`](FieldKey.md)
