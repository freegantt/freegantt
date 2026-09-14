# Class: AggregatorFailedError

Defined in: model/errors.ts:517

`code: 'aggregator-failed'` — a consumer Aggregator threw during the Rollup (D-S4-9). The
 transaction rolls back; nothing commits and no history entry is pushed.

## Extends

- [`FreeGanttError`](FreeGanttError.md)

## Constructors

### Constructor

> **new AggregatorFailedError**(`fieldKey`, `aggregatorName`, `entryId`, `cause?`): `AggregatorFailedError`

Defined in: model/errors.ts:522

#### Parameters

##### fieldKey

[`FieldKey`](../type-aliases/FieldKey.md)

##### aggregatorName

`string`

##### entryId

[`EntryId`](../type-aliases/EntryId.md)

##### cause?

`unknown`

#### Returns

`AggregatorFailedError`

#### Overrides

[`FreeGanttError`](FreeGanttError.md).[`constructor`](FreeGanttError.md#constructor)

## Properties

### aggregatorName

> `readonly` **aggregatorName**: `string`

Defined in: model/errors.ts:519

***

### code

> `readonly` **code**: `string`

Defined in: model/errors.ts:31

#### Inherited from

[`FreeGanttError`](FreeGanttError.md).[`code`](FreeGanttError.md#code)

***

### entryId

> `readonly` **entryId**: [`EntryId`](../type-aliases/EntryId.md)

Defined in: model/errors.ts:520

***

### fieldKey

> `readonly` **fieldKey**: [`FieldKey`](../type-aliases/FieldKey.md)

Defined in: model/errors.ts:518
