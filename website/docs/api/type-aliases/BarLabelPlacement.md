# Type Alias: BarLabelPlacement

> **BarLabelPlacement** = `"inside"` \| `"outside"`

Defined in: layout/renderer.ts:19

Which side of the bar the label paints on. This is the *answer* for one bar at one width, not the
 `barLabels` policy that produced it: `'fitBar'` reads `'inside'` for a bar the text fits and
 `'outside'` for one it does not.
