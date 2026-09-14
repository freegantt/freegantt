# Type Alias: TimeScaleFit

> **TimeScaleFit** = `"pane"` \| `"preset"` \| `number`

Defined in: layout/viewport/time-scale-model.ts:30

The density mode — what `pxPerMs` resolves to (S1.9, D-S1.9-2; renamed from `TimeScaleZoom`,
 issue #84 — "zoom" was one word for this mode, the `zoomTo` density knob, and the `zoomBy`
 gesture). `'pane'` (default) fits the measured pane width; `'preset'` ignores it and uses the
 preset's own density; an explicit `number` is pixels per millisecond, what `Viewport.zoomTo`/
 `zoomBy` write.
