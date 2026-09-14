# Class: UnknownCommandError

Defined in: model/errors.ts:837

`code: 'unknown-command'` — `CommandRegistry.run(id)` given an id nothing registered (D-S5-6). A
 binding whose `command` names an id nothing owns is not this: the keymap resolver treats an
 unresolved binding as a non-match and falls through, rather than surfacing the mistake mid-key-press.

## Extends

- [`FreeGanttError`](FreeGanttError.md)

## Constructors

### Constructor

> **new UnknownCommandError**(`commandId`): `UnknownCommandError`

Defined in: model/errors.ts:840

#### Parameters

##### commandId

`string`

#### Returns

`UnknownCommandError`

#### Overrides

[`FreeGanttError`](FreeGanttError.md).[`constructor`](FreeGanttError.md#constructor)

## Properties

### code

> `readonly` **code**: `string`

Defined in: model/errors.ts:31

#### Inherited from

[`FreeGanttError`](FreeGanttError.md).[`code`](FreeGanttError.md#code)

***

### commandId

> `readonly` **commandId**: `string`

Defined in: model/errors.ts:838
