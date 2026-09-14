# Interface: PopupOptions

Defined in: extensions/popup.ts:61

## Properties

### anchor

> **anchor**: [`Anchor`](../type-aliases/Anchor.md)

Defined in: extensions/popup.ts:62

***

### content

> **content**: [`ElementDescription`](ElementDescription.md)

Defined in: extensions/popup.ts:71

***

### dismissOn?

> `optional` **dismissOn?**: readonly [`DismissTrigger`](../type-aliases/DismissTrigger.md)[]

Defined in: extensions/popup.ts:70

Default `['escape', 'outsidePointer', 'scroll']`.

***

### focus?

> `optional` **focus?**: `"none"` \| `"trap"`

Defined in: extensions/popup.ts:68

Default `'none'`: never moves focus (the tooltip's own policy — a hover affordance that steals
 focus is a bug). `'trap'` moves focus in, cycles Tab inside, and restores it on close (the
 context menu's and the cell editor's policy).

***

### onDismiss?

> `optional` **onDismiss?**: (`trigger`) => `void`

Defined in: extensions/popup.ts:76

Review C3: the popup closed itself, and this says why. It runs after the popup is already
 closed, so `isOpen` reads `false` inside it. An owner detaches its own listeners here instead
 of guarding every one of them on `isOpen` for the rest of the page's life. `close()` called by
 the owner never fires this — the owner already knows.

#### Parameters

##### trigger

[`DismissTrigger`](../type-aliases/DismissTrigger.md)

#### Returns

`void`

***

### placement?

> `optional` **placement?**: [`PopupPlacement`](../type-aliases/PopupPlacement.md)

Defined in: extensions/popup.ts:64

Default `'bottom'`.
