# Class: DuplicateFieldKeyError

Defined in: model/errors.ts:352

`code: 'duplicate-field-key'` — two Field declarations share a `key`, including two declarations
 that both override the same core Field (D-S4-5, #142). A declaration naming a core Field's key
 alone, or naming one alongside an illegal key, is `IllegalCoreFieldOverrideError` instead — this
 error is for an outright clash, the same key claimed twice.

## Extends

- [`FreeGanttError`](FreeGanttError.md)

## Constructors

### Constructor

> **new DuplicateFieldKeyError**(`key`): `DuplicateFieldKeyError`

Defined in: model/errors.ts:355

#### Parameters

##### key

`string`

#### Returns

`DuplicateFieldKeyError`

#### Overrides

[`FreeGanttError`](FreeGanttError.md).[`constructor`](FreeGanttError.md#constructor)

## Properties

### code

> `readonly` **code**: `string`

Defined in: model/errors.ts:31

#### Inherited from

[`FreeGanttError`](FreeGanttError.md).[`code`](FreeGanttError.md#code)

***

### key

> `readonly` **key**: `string`

Defined in: model/errors.ts:353
