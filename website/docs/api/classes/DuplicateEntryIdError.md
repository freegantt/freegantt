# Class: DuplicateEntryIdError

Defined in: model/errors.ts:200

`code: 'duplicate-entry-id'` — `entries.add()` given an id already in the store (S2.3 §1.3).

## Extends

- [`FreeGanttError`](FreeGanttError.md)

## Constructors

### Constructor

> **new DuplicateEntryIdError**(`entryId`): `DuplicateEntryIdError`

Defined in: model/errors.ts:203

#### Parameters

##### entryId

[`EntryId`](../type-aliases/EntryId.md)

#### Returns

`DuplicateEntryIdError`

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

Defined in: model/errors.ts:201
