# Class: MutationCancelledError

Defined in: model/errors.ts:619

`code: 'mutation-cancelled'` — a `beforeChange` handler returned `false`, refusing the whole
changeset (D-S2-25). Thrown by the programmatic call that triggered the transaction, carrying the
changeset that was refused — `entries.update()`'s contract is to return the stored entry, and if
nothing was stored, returning one would be a lie.

`reason` is what the vetoing handler said through `refuse(reason)` (#210), and `undefined` when it
returned a bare `false`. The message quotes it verbatim: the words are prose the consumer wrote
for their own user, so core frames them and never rewords them.

## Extends

- [`FreeGanttError`](FreeGanttError.md)

## Constructors

### Constructor

> **new MutationCancelledError**(`changeSet`, `reason?`): `MutationCancelledError`

Defined in: model/errors.ts:623

#### Parameters

##### changeSet

[`ChangeSet`](../interfaces/ChangeSet.md)

##### reason?

`string`

#### Returns

`MutationCancelledError`

#### Overrides

[`FreeGanttError`](FreeGanttError.md).[`constructor`](FreeGanttError.md#constructor)

## Properties

### changeSet

> `readonly` **changeSet**: [`ChangeSet`](../interfaces/ChangeSet.md)

Defined in: model/errors.ts:620

***

### code

> `readonly` **code**: `string`

Defined in: model/errors.ts:31

#### Inherited from

[`FreeGanttError`](FreeGanttError.md).[`code`](FreeGanttError.md#code)

***

### reason

> `readonly` **reason**: `string` \| `undefined`

Defined in: model/errors.ts:621
