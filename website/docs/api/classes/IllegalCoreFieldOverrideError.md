# Class: IllegalCoreFieldOverrideError

Defined in: model/errors.ts:407

`code: 'illegal-core-field-override'` — a consumer declaration names a core Field's key (`start`,
 `name`, ...) and carries a key the library does not let a consumer override there. A core Field
 cannot be redeclared (`DuplicateFieldKeyError` is for two ordinary declarations sharing a key),
 but `field-registry.ts`'s `CORE_FIELD_OVERRIDABLE_KEYS` lets one declaration merge a narrow,
 named set of keys onto a core Field instead — `editable` today (#142). Naming any other key
 (`source`, `column`, ...) throws this.

## Extends

- [`FreeGanttError`](FreeGanttError.md)

## Constructors

### Constructor

> **new IllegalCoreFieldOverrideError**(`key`, `illegalKey`, `overridableKeys`): `IllegalCoreFieldOverrideError`

Defined in: model/errors.ts:412

#### Parameters

##### key

`string`

##### illegalKey

`string`

##### overridableKeys

readonly `string`[]

#### Returns

`IllegalCoreFieldOverrideError`

#### Overrides

[`FreeGanttError`](FreeGanttError.md).[`constructor`](FreeGanttError.md#constructor)

## Properties

### code

> `readonly` **code**: `string`

Defined in: model/errors.ts:31

#### Inherited from

[`FreeGanttError`](FreeGanttError.md).[`code`](FreeGanttError.md#code)

***

### illegalKey

> `readonly` **illegalKey**: `string`

Defined in: model/errors.ts:409

***

### key

> `readonly` **key**: `string`

Defined in: model/errors.ts:408

***

### overridableKeys

> `readonly` **overridableKeys**: readonly `string`[]

Defined in: model/errors.ts:410
