# Class: UnknownGridColumnError

Defined in: model/errors.ts:563

`code: 'unknown-grid-column'` — `gantt.hideGridColumn` or `gantt.showGridColumn` named a field
 that no declared column carries (D-S5-34). Both verbs act on a column this Gantt already
 declares. Neither one adds a column, so a name nothing declares is a mistake and says so. A
 hidden column stays declared, so `showGridColumn` always reaches what `hideGridColumn` hid.

## Extends

- [`FreeGanttError`](FreeGanttError.md)

## Constructors

### Constructor

> **new UnknownGridColumnError**(`field`): `UnknownGridColumnError`

Defined in: model/errors.ts:566

#### Parameters

##### field

[`FieldKey`](../type-aliases/FieldKey.md)

#### Returns

`UnknownGridColumnError`

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

Defined in: model/errors.ts:564
