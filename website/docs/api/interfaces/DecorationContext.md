# Interface: DecorationContext

Defined in: layout/decoration.ts:18

## Properties

### rows

> **rows**: readonly [`FrameRow`](FrameRow.md)[]

Defined in: layout/decoration.ts:22

The rows in that window, so a provider can shade a row instead of a date range.

***

### span

> **span**: [`TimeSpan`](TimeSpan.md)

Defined in: layout/decoration.ts:20

The visible time span, already widened by overscan.

***

### tickIncrement

> **tickIncrement**: `number`

Defined in: layout/decoration.ts:31

How many `tickUnit`s one tick column covers — 1 day reads as a day, 2 days does not.

***

### tickUnit

> **tickUnit**: [`TimeUnit`](../type-aliases/TimeUnit.md)

Defined in: layout/decoration.ts:29

What one tick column stands for — `'day'` with an increment of 1 means a reader can see
 individual days. A provider that only makes sense at some granularity tests these two and
 returns nothing at the others. Still time, not pixels (I12): the answer is a calendar step, so
 a shared axis (D9) resolves it the same way for every Gantt bound to it.

***

### time

> **time**: [`ZonedTime`](ZonedTime.md)

Defined in: layout/decoration.ts:24

Zone-bound date math (D-S5-16). The provider never touches `Date` or a magic constant.
