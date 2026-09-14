# Interface: DomTarget

Defined in: view/gantt-dom.ts:60

What one node in a Gantt's own DOM stands for. `kind` is `model/`'s `TargetKind`, the same five
 words `CommandTarget` already uses. One vocabulary, so a plugin that resolves a right-click and
 a command that filters on `when` say the same thing.

 It answers two different questions about Entries, because a Row may own several of them (#185,
 #199). `entry` is the node's **subject** — the one Entry whose Fields this node's content shows.
 A tooltip describes that Entry, and the cell editor anchors on it. `entryIds` is everything the
 node stands for, which is what an action on the node acts on. For a bar the two agree. For a
 row, and for a cell of that row, `entry` is the row's first Entry and `entryIds` is all of them.

 `entry` is left out when the row stands for no Entry (a grouping header row), or when the Entry
 is gone from the Dataset. `field` is filled for `'cell'` and `'header'`.

## Properties

### element

> **element**: `HTMLElement`

Defined in: view/gantt-dom.ts:64

The node the walk stopped on — the bar, the cell, the row, the header cell or the splitter.
 A popup anchors to it; the cell editor positions over it.

***

### entry?

> `optional` **entry?**: [`Entry`](Entry.md)\<`Record`\<`string`, `unknown`\>\>

Defined in: view/gantt-dom.ts:65

***

### entryIds

> **entryIds**: readonly [`EntryId`](../type-aliases/EntryId.md)[]

Defined in: view/gantt-dom.ts:68

Every Entry this node stands for, in row order. Empty for a header cell, for the splitter, and
 for a grouping header row. Never `undefined`, so a reader counts it without a fallback.

***

### field?

> `optional` **field?**: [`FieldKey`](../type-aliases/FieldKey.md)

Defined in: view/gantt-dom.ts:79

***

### kind

> **kind**: [`TargetKind`](../type-aliases/TargetKind.md)

Defined in: view/gantt-dom.ts:61

***

### segmentIds

> **segmentIds**: readonly [`SegmentId`](../type-aliases/SegmentId.md)[]

Defined in: view/gantt-dom.ts:78

Every Segment this node stands for (#212, ADR 0010) — the pane picks the unit. A bar for one
 Segment names that Segment alone. A bar for an Entry's whole span (a group, a milestone) names
 every Segment of that Entry. A row, a cell and a name cell name every Segment of every Entry
 the row owns, in row order. Empty for a header cell and the splitter. Never `undefined`, so a
 reader counts it without a fallback — the same posture `entryIds` takes.

 The layout answers, never the node's own `data-segment-id`. That stamp says which Segment a bar
 draws right now, which is a different, narrower question. It also describes one frame, and a
 bar node outlives a frame.
