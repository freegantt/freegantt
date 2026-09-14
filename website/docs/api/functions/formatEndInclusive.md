# Function: formatEndInclusive()

> **formatEndInclusive**(`zone`, `span`, `locale?`, `options?`): `string`

Defined in: time/format.ts:94

The one place half-open `end` becomes an inclusive display value: the last millisecond the span
actually covers, read back through the dataset zone. No `end - 1` anywhere else in the codebase
(plans/01 §5, promised since S0).

Takes the whole span, not `end` alone, because a zero-length span (`end === start`, legal under
D-S5-46) has no millisecond before its own start to display — `end - 1` there reads as one minute
earlier than `start` (#240). A zero-length span displays its own `end` unchanged instead.

## Parameters

### zone

`string`

### span

[`TimeSpan`](../interfaces/TimeSpan.md)

### locale?

`LocalesArgument`

### options?

`DateTimeFormatOptions`

## Returns

`string`
