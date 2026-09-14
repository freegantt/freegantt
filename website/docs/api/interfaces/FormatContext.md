# Interface: FormatContext

Defined in: model/field.ts:264

FieldContext plus this Gantt's locale. Built only at column-resolve time (D-S4-13), and reused
 for every cell — which is why it extends the ambient half and never the per-pass one.

## Extends

- [`FieldContext`](FieldContext.md)

## Properties

### locale

> `readonly` **locale**: `LocalesArgument`

Defined in: model/field.ts:265

***

### timeZone

> `readonly` **timeZone**: `string`

Defined in: model/field.ts:243

#### Inherited from

[`FieldContext`](FieldContext.md).[`timeZone`](FieldContext.md#timezone)
