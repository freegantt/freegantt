# Type Alias: InstantInput

> **InstantInput** = [`Instant`](Instant.md) \| `Date` \| `number` \| `string`

Defined in: model/time.ts:58

What a consumer may write anywhere the library stores an `Instant`.

A `number` is epoch milliseconds, so an already-branded `Instant` is accepted unchanged. A string
is either absolute (an explicit `Z` or numeric offset) or a Plain time — a wall-clock reading with
no zone, which names no Instant until the Dataset's zone resolves it (CONTEXT.md). `time/toInstant`
is the one place that reading happens.
