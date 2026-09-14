# Type Alias: BarSpanKind

> **BarSpanKind** = `"exact"` \| `"minimum"` \| `"fixed"`

Defined in: layout/frame.ts:56

What `barSpan` did to a bar's painted `[x, x + width)` extent (F12) — `'exact'` for the entry's
 own span, `'minimum'` for one `barSpan` widened to reach `minBarWidthPx`, `'fixed'` for an Item
 that carries its own `box` (ADR 0022). Named once so `barSpan`'s return type and `FrameBar.span`
 read one type instead of repeating the union.
