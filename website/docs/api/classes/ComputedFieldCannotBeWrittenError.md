# Class: ComputedFieldCannotBeWrittenError

Defined in: model/errors.ts:430

`code: 'computed-field-cannot-be-written'` — a `compute` Field declared `rollUp` or `editable`
 (thrown at registration), or an `entries.update()`/`add()` named one at the write door (thrown
 there by ADR 0015). One name for one concept: a `compute` Field runs on every read and owns no
 home to write into, whichever door found that out. The message says `compute`, never *derived* —
 that word covers a rolled-up value too, and a derived parent cell is `DerivedFieldNotWritableError`
 (ADR 0013) instead.

## Extends

- [`FreeGanttError`](FreeGanttError.md)

## Constructors

### Constructor

> **new ComputedFieldCannotBeWrittenError**(`key`, `operation`): `ComputedFieldCannotBeWrittenError`

Defined in: model/errors.ts:433

#### Parameters

##### key

`string`

##### operation

`string`

#### Returns

`ComputedFieldCannotBeWrittenError`

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

Defined in: model/errors.ts:431
