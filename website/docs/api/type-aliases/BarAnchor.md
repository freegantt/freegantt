# Type Alias: BarAnchor

> **BarAnchor** = `"start"` \| `"center"` \| `"end"`

Defined in: layout/items/item.ts:12

Which point of the entry's own span a fixed box holds fixed — `'center'` for a marker (a diamond
 points at an instant), `'start'` for a flag (the pole sits on the date and the cloth hangs to the
 right), `'end'` for the mirror. Named so a producer can state it as a type, not repeat the union
 (F12) — `fixedBoxX` (`layout/frame.ts`) is `BarAnchor`'s other reader.
