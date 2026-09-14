# Class: DuplicatePropsKeyError

Defined in: model/errors.ts:386

`code: 'duplicate-props-key'` — a constructor entry (or `entries.add()`) names one declared Field
 key twice: once flat, at the top level, and once again inside `props` (ADR 0011, Q15). The two
 spellings would silently disagree about which value wins, so this throws instead of picking one —
 an undeclared key never reaches here, because ingest carries it without a second opinion to
 conflict with.

## Extends

- [`FreeGanttError`](FreeGanttError.md)

## Constructors

### Constructor

> **new DuplicatePropsKeyError**(`key`, `entryId`): `DuplicatePropsKeyError`

Defined in: model/errors.ts:390

#### Parameters

##### key

`string`

##### entryId

`string`

#### Returns

`DuplicatePropsKeyError`

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

Defined in: model/errors.ts:388

***

### key

> `readonly` **key**: `string`

Defined in: model/errors.ts:387
