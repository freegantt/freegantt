# Type Alias: RendererFor\<P\>

> **RendererFor**\<`P`\> = `P` *extends* `"bar"` ? [`BarRenderer`](BarRenderer.md) : `P` *extends* `"cell"` ? [`CellRenderer`](CellRenderer.md) : `P` *extends* `"header"` ? [`HeaderRenderer`](HeaderRenderer.md) : [`TooltipRenderer`](TooltipRenderer.md)

Defined in: layout/renderer.ts:70

What `ctx.view.registerRenderer(point, renderer)` and `GanttOptions`'s four renderer keys both
 accept for one `point`. Four points, four function types, one slot each.

 ADR 0018 retired the `bar` point's per-kind map. It was a fifth site for a variant's name, and a
 variant's own `paint` is where that job lives now.

## Type Parameters

### P

`P` *extends* [`RendererPoint`](RendererPoint.md)
