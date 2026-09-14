# Interface: PopupSurface

Defined in: extensions/popup.ts:38

The three view seams a `Popup` needs: the layer it mounts in, the reconciler that builds its
 content, and the rects it places against (review N1 moved `bounds`/`paneBounds` off the mount
 layer onto `GanttDom`). A plugin passes `ctx.view`; the narrow `Pick`s keep a test's fake to what
 this file actually reads.

## Properties

### dom

> **dom**: `Pick`\<[`GanttDom`](GanttDom.md), `"bounds"` \| `"paneBounds"` \| `"paneOf"`\>

Defined in: extensions/popup.ts:42

***

### onDomEvent

> `readonly` **onDomEvent**: \<`K`\>(`type`, `handler`, `options?`) => [`Disposer`](../type-aliases/Disposer.md)

Defined in: extensions/popup.ts:49

One `document` listener, scoped to this Gantt (review A4). The scroll dismissal listens here
 (#177), which is what leaves `outsidePointer` below as the single unscoped listener
 `plans/01` §10 grants.

 Declared as a property, not a method: `open()` hands this seam to one dismiss row, and the
 implementation behind it is a closure that never reads `this`.

#### Type Parameters

##### K

`K` *extends* keyof `DocumentEventMap`

#### Parameters

##### type

`K`

##### handler

[`DomEventHandler`](../type-aliases/DomEventHandler.md)\<`K`\>

##### options?

[`DomEventOptions`](DomEventOptions.md)

#### Returns

[`Disposer`](../type-aliases/Disposer.md)

***

### overlay

> **overlay**: [`MountLayer`](MountLayer.md)

Defined in: extensions/popup.ts:39

## Methods

### renderElement()

> **renderElement**(`description`): `HTMLElement`

Defined in: extensions/popup.ts:41

Builds the popup body from `options.content` — `ctx.view.renderElement` (D-S5-10).

#### Parameters

##### description

[`ElementDescription`](ElementDescription.md)

#### Returns

`HTMLElement`
