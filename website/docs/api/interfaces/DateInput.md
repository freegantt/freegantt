# Interface: DateInput

Defined in: extensions/features/date-input.ts:18

What the inline editor mounts in a date cell.

## Properties

### element

> `readonly` **element**: `HTMLElement`

Defined in: extensions/features/date-input.ts:20

The control to mount in the cell.

## Methods

### destroy()

> **destroy**(): `void`

Defined in: extensions/features/date-input.ts:27

#### Returns

`void`

***

### onCommit()

> **onCommit**(`handler`): [`Disposer`](../type-aliases/Disposer.md)

Defined in: extensions/features/date-input.ts:26

The editor calls this to learn when the user is done (Enter, or the control's own commit).

#### Parameters

##### handler

() => `void`

#### Returns

[`Disposer`](../type-aliases/Disposer.md)

***

### read()

> **read**(): [`Instant`](../type-aliases/Instant.md) \| `undefined`

Defined in: extensions/features/date-input.ts:22

Reads what the user entered, in the dataset's zone. `undefined` means "not a date".

#### Returns

[`Instant`](../type-aliases/Instant.md) \| `undefined`

***

### write()

> **write**(`at`): `void`

Defined in: extensions/features/date-input.ts:24

Called when the editor opens.

#### Parameters

##### at

[`Instant`](../type-aliases/Instant.md)

#### Returns

`void`
