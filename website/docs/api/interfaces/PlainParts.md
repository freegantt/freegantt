# Interface: PlainParts

Defined in: model/time.ts:36

A *plain* time: a wall-clock reading with no zone attached, so it names no `Instant` until a zone
resolves it (CONTEXT.md). A domain shape, not zone machinery — which is why it lives here and not
in `time/`: `extensions/` needs it for the `dateInput` seam (D-S5-20) and may import `model/`,
while `time/` is sealed from it (D-S5-5). `time/`'s own `PlainParts` extends this with the
`dayOfWeek` its zone math fills in.

## Properties

### day

> **day**: `number`

Defined in: model/time.ts:40

***

### dayOfWeek?

> `optional` **dayOfWeek?**: `number`

Defined in: model/time.ts:47

ISO day of week: 1 = Monday … 7 = Sunday (D-S5-16). Derived, never authored: `time/`'s
 `toPlain` always fills it and its `fromPlain` never reads it, so a caller building a
 `PlainParts` to write may omit it.

***

### hour

> **hour**: `number`

Defined in: model/time.ts:41

***

### minute

> **minute**: `number`

Defined in: model/time.ts:42

***

### month

> **month**: `number`

Defined in: model/time.ts:39

1-12.

***

### second

> **second**: `number`

Defined in: model/time.ts:43

***

### year

> **year**: `number`

Defined in: model/time.ts:37
