# Class: EntryNotFoundError

Defined in: model/errors.ts:146

`code: 'entry-not-found'` — an id the Dataset has no entry for, from `reveal(entryId)` (S1.9,
D-S1.9-6) or a mutator (`entries.update`/`remove`, or a `parentId` naming a missing entry —
S2.3 §1.3). A read never raises it: a row is how a value is read, and `entries.get` answers
`undefined` for an id the Dataset has no entry for (ADR 0017). `operation` names the call that failed, so the message points at what
the caller asked for rather than a generic "not found".

## Extends

- [`FreeGanttError`](FreeGanttError.md)

## Constructors

### Constructor

> **new EntryNotFoundError**(`entryId`, `operation`): `EntryNotFoundError`

Defined in: model/errors.ts:150

#### Parameters

##### entryId

[`EntryId`](../type-aliases/EntryId.md)

##### operation

`string`

#### Returns

`EntryNotFoundError`

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

Defined in: model/errors.ts:147

***

### operation

> `readonly` **operation**: `string`

Defined in: model/errors.ts:148
