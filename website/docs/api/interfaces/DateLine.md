# Interface: DateLine

Defined in: layout/date-line.ts:22

What a caller states to place a Date line besides the today wrapper, resolved to an `Instant`.
`api/gantt.ts` publishes this same shape as `Gantt.dateLines`'s read type (S1.13, D-S1.13-2,
S4-1) — `DateLineInput` is its loose counterpart on the way in.

## Properties

### className?

> `optional` **className?**: `string`

Defined in: layout/date-line.ts:25

***

### label?

> `optional` **label?**: `string`

Defined in: layout/date-line.ts:24

***

### placeAt

> **placeAt**: [`Instant`](../type-aliases/Instant.md)

Defined in: layout/date-line.ts:23
