# Interface: TimeScaleModelOptions

Defined in: layout/viewport/time-scale-model.ts:35

What a caller states about how time should be displayed, to construct a TimeScaleModel
 (plans/02 §5; renamed from `TimeScaleIntent`, issue #84 — a caller states options, not
 "intent"). Everything else — the dataset's zone (D6), the span — is derived at bind time.

## Properties

### fit?

> `optional` **fit?**: [`TimeScaleFit`](../type-aliases/TimeScaleFit.md)

Defined in: layout/viewport/time-scale-model.ts:41

Default `'pane'`.

***

### preset?

> `optional` **preset?**: [`PresetRef`](../type-aliases/PresetRef.md)

Defined in: layout/viewport/time-scale-model.ts:37

Governs header ticks and, with no viewport to fit, the resolved density. Defaults to `dayPreset`.

***

### range?

> `optional` **range?**: [`TimeSpan`](TimeSpan.md) \| `"fitDataset"`

Defined in: layout/viewport/time-scale-model.ts:39

`'fitDataset'` (the default) spans the entries of every bound dataset; a `TimeSpan` pins the axis.
