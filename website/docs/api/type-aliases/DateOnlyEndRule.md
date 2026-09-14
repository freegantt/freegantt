# Type Alias: DateOnlyEndRule

> **DateOnlyEndRule** = `"inclusive"` \| `"exclusive"`

Defined in: model/time.ts:75

How a *date-only* `end` input (`'2026-09-08'`, no time of day) is read.

Storage is half-open [start, end) (plans/01 §5), but a consumer writing a bare date on `end` means the
last day it wants included. `'inclusive'` (the default) advances such an end to the next day's
start, so `end: '2026-09-08'` covers through the 8th. `'exclusive'` reads it literally, as the
start of the 8th. Only date-only strings are affected: an `Instant`, a `Date`, and a string
carrying a time of day are always literal.
