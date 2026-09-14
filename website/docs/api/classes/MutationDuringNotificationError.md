# Class: MutationDuringNotificationError

Defined in: model/errors.ts:579

`code: 'mutation-during-notification'` — a mutator called while `beforeChange` or `change` handlers
are running (D-S2-9, D-S2-25). The write set is discarded; nothing about the notification in
progress is affected.

## Extends

- [`FreeGanttError`](FreeGanttError.md)

## Constructors

### Constructor

> **new MutationDuringNotificationError**(`operation`): `MutationDuringNotificationError`

Defined in: model/errors.ts:582

#### Parameters

##### operation

`string`

#### Returns

`MutationDuringNotificationError`

#### Overrides

[`FreeGanttError`](FreeGanttError.md).[`constructor`](FreeGanttError.md#constructor)

## Properties

### code

> `readonly` **code**: `string`

Defined in: model/errors.ts:31

#### Inherited from

[`FreeGanttError`](FreeGanttError.md).[`code`](FreeGanttError.md#code)

***

### operation

> `readonly` **operation**: `string`

Defined in: model/errors.ts:580
