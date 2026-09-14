# Interface: GanttDom

Defined in: view/gantt-dom.ts:85

This Gantt's own DOM, as questions (S5.3, D-S5-8; review N1/A3). Reached by a plugin through
 `ctx.view.dom`. Every member is scoped to one container, which is what keeps two Gantts on one
 page independent (I2).

## Properties

### bounds

> `readonly` **bounds**: `DOMRect`

Defined in: view/gantt-dom.ts:111

The container's own client rect — the outer clamp, so a popup never spills past the Gantt
 entirely.

***

### paneBounds

> `readonly` **paneBounds**: `Record`\<[`PaneName`](../type-aliases/PaneName.md), `DOMRect`\>

Defined in: view/gantt-dom.ts:116

The grid pane's and timeline pane's own client rects (issue #137 F8). The container spans both
 panes, so `bounds` alone cannot flip a popup at a pane edge. Placement flips and clamps against
 the anchor's own pane rect instead. `bounds` stays the outer clamp for a popup whose anchor
 sits in neither pane (a toolbar button, say).

## Methods

### barFor()

> **barFor**(`id`): `HTMLElement` \| `undefined`

Defined in: view/gantt-dom.ts:100

The first bar of `id` that the current frame has mounted. A popup or a tooltip anchors on it.
 It asks the layout which Items the entry draws (#185). So an entry whose first Segment is
 scrolled off still anchors on a Segment that is on screen. `undefined` when the entry has no
 bar in the current frame at all.

#### Parameters

##### id

`string` \| [`EntryId`](../type-aliases/EntryId.md)

#### Returns

`HTMLElement` \| `undefined`

***

### cellFor()

> **cellFor**(`id`, `field`): `HTMLElement` \| `undefined`

Defined in: view/gantt-dom.ts:104

The rendered grid cell for one entry and one Field. `undefined` when that row is not in the
 current frame, or the Gantt shows no column for `field`. It is also the one answer to "is my
 editor still anchored?" — a recycled row stops answering for the entry it used to hold.

#### Parameters

##### id

`string` \| [`EntryId`](../type-aliases/EntryId.md)

##### field

[`FieldKey`](../type-aliases/FieldKey.md)

#### Returns

`HTMLElement` \| `undefined`

***

### cellText()

> **cellText**(`cell`): `string`

Defined in: view/gantt-dom.ts:108

The text one grid cell shows right now — the string `field.formatValue` already produced for
 this paint. The inline editor seeds itself with it rather than formatting the value a second
 time from a `FormatContext` a plugin cannot reach (D-S5-5).

#### Parameters

##### cell

`HTMLElement`

#### Returns

`string`

***

### owns()

> **owns**(`node`): `boolean`

Defined in: view/gantt-dom.ts:88

Whether `node` sits inside this Gantt's own container. The one answer to "is this event mine?"
 — `ctx.view.onDomEvent` asks it for every document-level listener a plugin opens.

#### Parameters

##### node

`Node`

#### Returns

`boolean`

***

### paneOf()

> **paneOf**(`node`): [`PaneName`](../type-aliases/PaneName.md) \| `undefined`

Defined in: view/gantt-dom.ts:125

Which pane holds `node`, or `undefined` when it is in neither — a node outside this Gantt, or
 inside it but over the overlay layer. It answers by element identity, so it is a `contains`
 check and costs no layout (#177).

 Use it for an ownership question: whose scroll was that, which pane did the user act in. Use
 `paneBounds` for a geometric one: where do I place and clamp a box. Asking geometry about
 ownership forces two `getBoundingClientRect` calls per event. That is what `Popup`'s own scroll
 dismissal used to do, on every scroll in the document.

#### Parameters

##### node

`Node`

#### Returns

[`PaneName`](../type-aliases/PaneName.md) \| `undefined`

***

### targetUnder()

> **targetUnder**(`node`): [`DomTarget`](DomTarget.md) \| `undefined`

Defined in: view/gantt-dom.ts:95

What the nearest bar, cell, row, header cell or splitter at or above `node` stands for.
 `undefined` when `node` is outside this Gantt, or inside it but on none of those (an empty
 stretch of timeline, a pane's own padding).

 Hot path: this seam memoizes the resolved object on the element it came from. A pointer that
 stays over one bar resolves to the same frozen object every time, and allocates nothing.

#### Parameters

##### node

`Node`

#### Returns

[`DomTarget`](DomTarget.md) \| `undefined`
