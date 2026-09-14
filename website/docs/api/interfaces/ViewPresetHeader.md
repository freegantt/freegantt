# Interface: ViewPresetHeader

Defined in: time/scale.ts:37

What a caller states about a stepping cadence — the shared shape `ViewPresetHeader` and
`TimeScale.ticks` both key off (S1.7 §3.3).

## Extends

- [`TickStep`](TickStep.md)

## Properties

### format

> **format**: [`DateFormat`](../type-aliases/DateFormat.md)

Defined in: time/scale.ts:38

***

### increment

> `readonly` **increment**: `number`

Defined in: time/scale.ts:13

#### Inherited from

[`TickStep`](TickStep.md).[`increment`](TickStep.md#increment)

***

### repeatCoarserUnits?

> `optional` **repeatCoarserUnits?**: `boolean`

Defined in: time/scale.ts:44

A coarser band earlier in `headers` (bands are coarsest first) that already spells out `year`
 or `month` makes this band drop that field from its own `format` by default — the day band
 under a month band reads "21", not "Sep 21, 2026" (S1.12 follow-up, header readability). Set
 `true` to keep this band's `format` exactly as written. No effect on a callback `format`: only
 `Intl.DateTimeFormatOptions` fields are ever inspected or stripped.

***

### unit

> `readonly` **unit**: [`TimeUnit`](../type-aliases/TimeUnit.md)

Defined in: time/scale.ts:12

#### Inherited from

[`TickStep`](TickStep.md).[`unit`](TickStep.md#unit)
