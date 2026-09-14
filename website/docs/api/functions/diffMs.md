# Function: diffMs()

> **diffMs**(`a`, `b`): `number`

Defined in: time/instant.ts:41

How far `a` sits after `b`, in milliseconds — negative when it sits before. `addMs`'s pair:
 `addMs(start, diffMs(proposed, current))` moves a second entry by the same amount as the first
 (`harness/plugins/lock-entries.ts`). One of the two places in the library allowed to do
 arithmetic on an `Instant` — everywhere else in `src/**` calls this instead (I10).

## Parameters

### a

[`Instant`](../type-aliases/Instant.md)

### b

[`Instant`](../type-aliases/Instant.md)

## Returns

`number`
