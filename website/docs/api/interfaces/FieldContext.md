# Interface: FieldContext

Defined in: model/field.ts:242

Ambient. One per Dataset, reused by every read — the zone, and nothing that belongs to one row
 (ADR 0017, J5). `FormatContext` and `ComputeContext` both extend it, and `parseValue` receives it.

 It does not take the consumer's field map: a `FieldContext` reaches `layout/` and `view/`, and
 making those layers generic over one consumer's fields is what ADR 0005 rejected. A row's own
 value reads off the row — `entry.read(key)`.

## Extended by

- [`ComputeContext`](ComputeContext.md)
- [`FormatContext`](FormatContext.md)

## Properties

### timeZone

> `readonly` **timeZone**: `string`

Defined in: model/field.ts:243
