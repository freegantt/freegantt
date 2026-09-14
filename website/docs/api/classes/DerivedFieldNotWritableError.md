# Class: DerivedFieldNotWritableError

Defined in: model/errors.ts:471

`code: 'derived-field-not-writable'` — `entries.update()` named a Field on an Entry that has
 children, and that Field rolls up (ADR 0013). Nothing but the Rollup writes a rolling-up parent's
 cell: a write here would commit and the next Rollup would overwrite it in silence, so the library
 refuses instead. A `compute` Field has no stored home at all and is
 `ComputedFieldCannotBeWrittenError`; this is for a Field that *does* have one, just not on this
 Entry right now.

## Extends

- [`FreeGanttError`](FreeGanttError.md)

## Constructors

### Constructor

> **new DerivedFieldNotWritableError**(`key`, `entryId`, `operation`): `DerivedFieldNotWritableError`

Defined in: model/errors.ts:475

#### Parameters

##### key

`string`

##### entryId

`string`

##### operation

`string`

#### Returns

`DerivedFieldNotWritableError`

#### Overrides

[`FreeGanttError`](FreeGanttError.md).[`constructor`](FreeGanttError.md#constructor)

## Properties

### code

> `readonly` **code**: `string`

Defined in: model/errors.ts:31

#### Inherited from

[`FreeGanttError`](FreeGanttError.md).[`code`](FreeGanttError.md#code)

***

### entryId

> `readonly` **entryId**: `string`

Defined in: model/errors.ts:473

***

### key

> `readonly` **key**: `string`

Defined in: model/errors.ts:472
