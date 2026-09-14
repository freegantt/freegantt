# Interface: MountLayer

Defined in: view/mount-layer.ts:34

A layer of this Gantt that a plugin mounts content into. Reached as `ctx.view.overlay` or
 `ctx.view.rowLayer`.

## Properties

### bounds

> `readonly` **bounds**: `DOMRect`

Defined in: view/mount-layer.ts:42

This layer's own client rect. `content` sits at the layer's origin, so a caller positions by
 the offset between its anchor's rect and this one.

## Methods

### onResize()

> **onResize**(`callback`): [`Disposer`](../type-aliases/Disposer.md)

Defined in: view/mount-layer.ts:39

Notifies on every resize of the Gantt's container (issue #137 F9). A reflow moves the anchor
 with no scroll at all — a column width change, say. The `Disposer` unsubscribes.

#### Parameters

##### callback

() => `void`

#### Returns

[`Disposer`](../type-aliases/Disposer.md)

***

### present()

> **present**(`content`): [`Disposer`](../type-aliases/Disposer.md)

Defined in: view/mount-layer.ts:36

Mounts `content` in this layer. The `Disposer` takes it out again.

#### Parameters

##### content

`HTMLElement`

#### Returns

[`Disposer`](../type-aliases/Disposer.md)
