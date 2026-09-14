# Type Alias: DateFormat

> **DateFormat** = `Intl.DateTimeFormatOptions` \| [`HeaderFormat`](HeaderFormat.md)

Defined in: time/scale.ts:35

What a header band states to turn an Instant into its label (S1.12, D-S1.12-11). Options are
resolved through `Intl.DateTimeFormat` in the Gantt's locale and the Dataset's zone; a callback is
the escape hatch for anything Intl has no field for (see `formatWeekNumber`).
