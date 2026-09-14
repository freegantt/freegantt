# Class: UnknownAggregatorError

Defined in: model/errors.ts:488

`code: 'unknown-aggregator'` — `rollUp` names an Aggregator that is not shipped and not in
 `DatasetOptions.aggregators` (D-S4-5).

## Extends

- [`FreeGanttError`](FreeGanttError.md)

## Constructors

### Constructor

> **new UnknownAggregatorError**(`aggregatorName`): `UnknownAggregatorError`

Defined in: model/errors.ts:491

#### Parameters

##### aggregatorName

`string`

#### Returns

`UnknownAggregatorError`

#### Overrides

[`FreeGanttError`](FreeGanttError.md).[`constructor`](FreeGanttError.md#constructor)

## Properties

### aggregatorName

> `readonly` **aggregatorName**: `string`

Defined in: model/errors.ts:489

***

### code

> `readonly` **code**: `string`

Defined in: model/errors.ts:31

#### Inherited from

[`FreeGanttError`](FreeGanttError.md).[`code`](FreeGanttError.md#code)
