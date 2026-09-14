# Function: isCoarserThan()

> **isCoarserThan**(`unit`, `than`): `boolean`

Defined in: time/zone.ts:190

Call: `isCoarserThan(tickUnit, 'day')` — true when `unit` groups a wider calendar span than
 `than` (`isCoarserThan('week', 'day')` is `true`; `isCoarserThan('day', 'day')` is `false`).
 For a plugin author asking "is this tick too coarse to draw per-day decoration?" without
 building its own rank table over `TimeUnit` (#268).

 This is **calendar-nesting order, not duration order**: a month is coarser than a week because
 every month's days group into it, not because a month spans more milliseconds than four weeks
 always would (it doesn't). That distinction is harmless for a granularity-floor question like the
 one above, and wrong the moment someone reaches for this to do arithmetic — `time/` exists to
 keep that kind of arithmetic out of the caller's hands (`plans/01` §5, I10), so reach for
 `stepBy`/`diffDays` there instead.

## Parameters

### unit

[`TimeUnit`](../type-aliases/TimeUnit.md)

### than

[`TimeUnit`](../type-aliases/TimeUnit.md)

## Returns

`boolean`
