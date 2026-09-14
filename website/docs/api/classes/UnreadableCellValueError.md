# Class: UnreadableCellValueError

Defined in: model/errors.ts:644

`code: 'unreadable-value'` — the built-in cell editor's control read no value back from the text
it holds, so nothing was written and the editor stayed open (#234). A `parseValue` that refused
the text is the usual cause; a date control with no date in it is the other.

Never thrown: the editor raises it as the `cause` of its own Error report, the way
`MutationCancelledError` carries the refused `ChangeSet` for `data/transaction.ts`. It exists so
that the Field key and the text the user typed reach a consumer as readonly members, rather than
spliced into a message a consumer would have to parse.

## Extends

- [`FreeGanttError`](FreeGanttError.md)

## Constructors

### Constructor

> **new UnreadableCellValueError**(`entryId`, `field`, `text`): `UnreadableCellValueError`

Defined in: model/errors.ts:651

#### Parameters

##### entryId

[`EntryId`](../type-aliases/EntryId.md)

##### field

[`FieldKey`](../type-aliases/FieldKey.md)

##### text

`string` \| `undefined`

#### Returns

`UnreadableCellValueError`

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

> `readonly` **entryId**: [`EntryId`](../type-aliases/EntryId.md)

Defined in: model/errors.ts:645

***

### field

> `readonly` **field**: [`FieldKey`](../type-aliases/FieldKey.md)

Defined in: model/errors.ts:646

***

### text

> `readonly` **text**: `string` \| `undefined`

Defined in: model/errors.ts:649

What the control held. `undefined` when the control keeps no text of its own — a date control
 reads a date or nothing, and has no string to hand over.
