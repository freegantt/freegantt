# Type Alias: GanttScaleOptions

> **GanttScaleOptions** = \{ `fit?`: `never`; `preset?`: `never`; `range?`: `never`; `scale`: [`TimeScaleModel`](../classes/TimeScaleModel.md); \} \| \{ `fit?`: [`TimeScaleFit`](TimeScaleFit.md); `preset?`: [`PresetRef`](PresetRef.md); `range?`: `"fitDataset"` \| \{ `end`: [`InstantInput`](InstantInput.md); `start`: [`InstantInput`](InstantInput.md); \}; `scale?`: `undefined`; \}

Defined in: api/gantt.ts:206

Two ways to set the axis, made mutually exclusive at the type level (issue #84 — the prior shape
accepted both and silently ignored `preset`/`range`/`fit` in favor of `scale`, with only a warning
to say so). Sharing an axis and building a private one from `preset`/`range`/`fit` are not two knobs
for the same job; a caller states one or the other.

## Union Members

### Type Literal

\{ `fit?`: `never`; `preset?`: `never`; `range?`: `never`; `scale`: [`TimeScaleModel`](../classes/TimeScaleModel.md); \}

#### fit?

> `optional` **fit?**: `never`

#### preset?

> `optional` **preset?**: `never`

#### range?

> `optional` **range?**: `never`

#### scale

> **scale**: [`TimeScaleModel`](../classes/TimeScaleModel.md)

Bound viewport object (D9, plans/02 §5) — pass the same instance to two Gantt instances to
x-sync them.

***

### Type Literal

\{ `fit?`: [`TimeScaleFit`](TimeScaleFit.md); `preset?`: [`PresetRef`](PresetRef.md); `range?`: `"fitDataset"` \| \{ `end`: [`InstantInput`](InstantInput.md); `start`: [`InstantInput`](InstantInput.md); \}; `scale?`: `undefined`; \}

#### fit?

> `optional` **fit?**: [`TimeScaleFit`](TimeScaleFit.md)

#### preset?

> `optional` **preset?**: [`PresetRef`](PresetRef.md)

Build a private default `TimeScaleModel` (D-S1.9-9) sized to the dataset's entries.

#### range?

> `optional` **range?**: `"fitDataset"` \| \{ `end`: [`InstantInput`](InstantInput.md); `start`: [`InstantInput`](InstantInput.md); \}

Loose input (S1.12, D-S1.12-8), read through the dataset's zone at construction/assignment.

#### scale?

> `optional` **scale?**: `undefined`
