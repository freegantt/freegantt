# Interface: KeyEventLike

Defined in: extensions/keymap.ts:52

The subset of `KeyboardEvent` the resolver reads — kept narrow so a test can build one with a
 plain object instead of constructing a real `KeyboardEvent`. `stopPropagation` is here for a
 `registerHandler` callback (below) that wants to stop an event dead, the same way a popup's
 Escape dismissal does — a plain object test still needs to supply a stub.

## Properties

### altKey

> **altKey**: `boolean`

Defined in: extensions/keymap.ts:56

***

### ctrlKey

> **ctrlKey**: `boolean`

Defined in: extensions/keymap.ts:54

***

### isComposing

> **isComposing**: `boolean`

Defined in: extensions/keymap.ts:58

***

### key

> **key**: `string`

Defined in: extensions/keymap.ts:53

***

### metaKey

> **metaKey**: `boolean`

Defined in: extensions/keymap.ts:57

***

### shiftKey

> **shiftKey**: `boolean`

Defined in: extensions/keymap.ts:55

***

### target

> **target**: `EventTarget` \| `null`

Defined in: extensions/keymap.ts:59

## Methods

### stopPropagation()

> **stopPropagation**(): `void`

Defined in: extensions/keymap.ts:60

#### Returns

`void`
