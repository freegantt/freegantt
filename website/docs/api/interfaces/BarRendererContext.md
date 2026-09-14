# Interface: BarRendererContext

Defined in: layout/renderer.ts:29

## Properties

### entry

> **entry**: [`Entry`](Entry.md)

Defined in: layout/renderer.ts:30

***

### item

> **item**: [`FrameBar`](FrameBar.md)

Defined in: layout/renderer.ts:31

***

### label?

> `optional` **label?**: [`ResolvedBarLabel`](ResolvedBarLabel.md)

Defined in: layout/renderer.ts:35

Absent when the consumer asked for no label (`barLabels: 'none'`) — so a renderer reads "this
 bar has a label, here is where it goes" or nothing, and "a label with nowhere to paint" stays
 unrepresentable.
