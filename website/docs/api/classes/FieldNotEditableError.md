# Class: FieldNotEditableError

Defined in: model/errors.ts:450

`code: 'field-not-editable'` — `entries.update()` named a Field whose `editable` is `'never'`
 (ADR 0015). The same key gates the grid at a second threshold: `'api'` keeps the cell dead and
 still lets `update()` through, so only the lock reaches this door.

 A lock names what a *caller* may write, never what the library may. Construction, `entries.add()`
 and History replay all still write a locked Field, so this error belongs to the change door
 alone.

## Extends

- [`FreeGanttError`](FreeGanttError.md)

## Constructors

### Constructor

> **new FieldNotEditableError**(`field`, `operation`): `FieldNotEditableError`

Defined in: model/errors.ts:454

#### Parameters

##### field

[`FieldKey`](../type-aliases/FieldKey.md)

##### operation

`string`

#### Returns

`FieldNotEditableError`

#### Overrides

[`FreeGanttError`](FreeGanttError.md).[`constructor`](FreeGanttError.md#constructor)

## Properties

### code

> `readonly` **code**: `string`

Defined in: model/errors.ts:31

#### Inherited from

[`FreeGanttError`](FreeGanttError.md).[`code`](FreeGanttError.md#code)

***

### field

> `readonly` **field**: [`FieldKey`](../type-aliases/FieldKey.md)

Defined in: model/errors.ts:451

***

### operation

> `readonly` **operation**: `string`

Defined in: model/errors.ts:452
