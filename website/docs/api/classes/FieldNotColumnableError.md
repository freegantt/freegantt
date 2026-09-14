# Class: FieldNotColumnableError

Defined in: model/errors.ts:546

`code: 'field-not-columnable'` — `gridColumns` named a Field that did not declare `column`
 (D-S4-12). Thrown when S4.3 resolves columns.

## Extends

- [`FreeGanttError`](FreeGanttError.md)

## Constructors

### Constructor

> **new FieldNotColumnableError**(`key`): `FieldNotColumnableError`

Defined in: model/errors.ts:549

#### Parameters

##### key

`string`

#### Returns

`FieldNotColumnableError`

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

Defined in: model/errors.ts:547
