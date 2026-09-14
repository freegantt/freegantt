# Interface: DatasetFieldRegistrations

Defined in: api/dataset-plugin.ts:57

Field declarations a plugin adds to the Dataset it installs into (D-S5-21). Legal while `data()`
 runs and not after — a later call throws `RegistrationClosedError` (D-S5-4).

## Methods

### register()

> **register**(`field`): `void`

Defined in: api/dataset-plugin.ts:58

#### Parameters

##### field

[`Field`](../type-aliases/Field.md)

#### Returns

`void`

***

### registerAggregator()

> **registerAggregator**(`name`, `fn`): `void`

Defined in: api/dataset-plugin.ts:60

#### Parameters

##### name

[`AggregatorName`](../type-aliases/AggregatorName.md)

##### fn

[`Aggregator`](../type-aliases/Aggregator.md)

#### Returns

`void`

***

### registerType()

> **registerType**(`name`, `type`): `void`

Defined in: api/dataset-plugin.ts:59

#### Parameters

##### name

[`FieldTypeName`](../type-aliases/FieldTypeName.md)

##### type

[`FieldType`](FieldType.md)

#### Returns

`void`
