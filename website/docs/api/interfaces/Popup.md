# Interface: Popup

Defined in: extensions/popup.ts:79

## Properties

### isOpen

> `readonly` **isOpen**: `boolean`

Defined in: extensions/popup.ts:84

## Methods

### close()

> **close**(): `void`

Defined in: extensions/popup.ts:83

#### Returns

`void`

***

### open()

> **open**(`options`): `void`

Defined in: extensions/popup.ts:82

Calling `open()` while a popup is already open replaces it — the previous popup is closed
 first, then the new one opens at its own placement.

#### Parameters

##### options

[`PopupOptions`](PopupOptions.md)

#### Returns

`void`
