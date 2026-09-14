# Type Alias: CoreFieldValue\<K\>

> **CoreFieldValue**\<`K`\> = `K` *extends* keyof [`CoreFieldValues`](../interfaces/CoreFieldValues.md) ? [`CoreFieldValues`](../interfaces/CoreFieldValues.md)\[`K`\] : `unknown`

Defined in: model/field-key.ts:38

A core Field's value, and `unknown` for every other key. This is all a `FieldContext` can
 promise: it flows into `layout/` and `view/`, and threading a consumer's field map through those
 layers is the option ADR 0005 rejected.

## Type Parameters

### K

`K` *extends* [`FieldKey`](FieldKey.md)
