# Interface: FrameBar

Defined in: layout/frame.ts:136

## Properties

### a11yLabel

> **a11yLabel**: `string`

Defined in: layout/frame.ts:175

What a screen reader announces: `${entry.name}, ${formatDate(zone, start)} – ${formatEndInclusive(zone, span)}`.
Library-derived text, not consumer render output — same precedent as `label` (plans/01 §4: "no user
render output in the frame"). Composed here because it needs the dataset zone and inclusive-end
formatting, both `time/`-only (S1.10, D-S1.10-5).

***

### entryId

> **entryId**: [`EntryId`](../type-aliases/EntryId.md)

Defined in: layout/frame.ts:138

***

### flags

> **flags**: [`BarFlags`](BarFlags.md)

Defined in: layout/frame.ts:161

***

### height

> **height**: `number`

Defined in: layout/frame.ts:160

***

### id

> **id**: [`ItemId`](../type-aliases/ItemId.md)

Defined in: layout/frame.ts:137

***

### label

> **label**: `string`

Defined in: layout/frame.ts:156

The entry's name — what a backend renders as the bar's label (#26).

***

### rowId

> **rowId**: [`RowId`](../type-aliases/RowId.md)

Defined in: layout/frame.ts:139

***

### segmentId?

> `optional` **segmentId?**: [`SegmentId`](../type-aliases/SegmentId.md)

Defined in: layout/frame.ts:145

The one Segment this bar **draws** (#212, ADR 0010), carried straight through from the Item
 that produced it. Absent for a bar that draws the Entry's whole span (a parent, or a plugin's
 own variant) — that bar draws no single Segment.

***

### segmentIds

> **segmentIds**: readonly [`SegmentId`](../type-aliases/SegmentId.md)[]

Defined in: layout/frame.ts:154

Every Segment this bar **stands for** (#212, #230, ADR 0010) — the Segments that select it and
 paint it. A bar that drew one Segment stands for that Segment alone, so this holds it and
 `segmentId` names it. A bar that drew its Entry's whole span stands for every Segment of that
 Entry, because any of them selects it, so this holds them all and `segmentId` is absent.

 The frame states the fact, and a reader never derives it from an Entry of its own: the set and
 the Items it describes come from one cached record of one Entry snapshot, so they cannot fall
 out of step. `FrameLayout.segmentIdsForItem` answers the same fact for a lookup by id.

***

### span

> **span**: [`BarSpanKind`](../type-aliases/BarSpanKind.md)

Defined in: layout/frame.ts:170

What `barSpan` did to this bar's painted `[x, x + width)` extent: `'exact'` for the entry's own
 span, `'minimum'` for one `barSpan` widened to reach `minBarWidthPx`, `'fixed'` for an Item that
 carries its own `box` (ADR 0022). One value, because a bar is never both floored and fixed —
 `data-span` is one attribute slot, so the type mirrors the DOM it feeds.

 States a fact about the paint, not a judgement on the variant (plans/01 §2.5 bans a variant
 check here); a consumer tells a floored or fixed bar apart by pairing this with `variant`.
 `render/` stamps it as `data-span="minimum"` or `data-span="fixed"` (`02` §4).

***

### variant

> **variant**: `string`

Defined in: layout/frame.ts:141

The variant this bar draws as (ADR 0018) — the `data-variant` `render/` stamps.

***

### width

> **width**: `number`

Defined in: layout/frame.ts:159

***

### x

> **x**: `number`

Defined in: layout/frame.ts:157

***

### y

> **y**: `number`

Defined in: layout/frame.ts:158
