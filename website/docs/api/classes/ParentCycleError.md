# Class: ParentCycleError

Defined in: model/errors.ts:236

`code: 'parent-cycle'` — a `parentId` edit that would make an entry its own ancestor, self-parenting
included (S2.3 §1.3).

## Extends

- [`FreeGanttError`](FreeGanttError.md)

## Constructors

### Constructor

> **new ParentCycleError**(`entryId`): `ParentCycleError`

Defined in: model/errors.ts:239

#### Parameters

##### entryId

[`EntryId`](../type-aliases/EntryId.md)

#### Returns

`ParentCycleError`

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

Defined in: model/errors.ts:237
