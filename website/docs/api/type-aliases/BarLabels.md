# Type Alias: BarLabels

> **BarLabels** = `"fitBar"` \| `"inside"` \| `"outside"` \| `"none"`

Defined in: layout/renderer.ts:94

Where the default bar label paints, when no `barRenderer` already owns the bar's content (J1).
 `'fitBar'` (the default) reads inside when the label fits, outside to the right when it does not,
 and falls back to inside, ellipsised, when neither fits — a family with the shipped
 `range: 'fitDataset'` and `gridWidth: 'fitColumns'`. `'inside'` and `'outside'` force one placement
 regardless of fit (ellipsised inside, or clipped at the pane edge outside — the same load-bearing
 fallback `'fitBar'`'s third clause takes). `'none'` paints no label at all, and a `barRenderer`
 sees no `ctx.label` either — one answer to "did the consumer ask for a label", for the library's
 own paint and for a renderer's alike.
