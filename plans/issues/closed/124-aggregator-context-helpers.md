# #124 — Aggregator callback ergonomics for custom rollUp functions

**Reported:** 2026-08-31. Not stale.

**Status (2026-09-01):** Done. `RollUpContext.values`/`numericValues` added
(`src/model/field.ts`), built once via `createRollUpContext` in
`src/data/fields/field-access.ts`, and `rollup.ts` now calls that instead of
the old inline `{ ...ctx, field: field.key }` spread. Shipped `sum`/`min`/
`max`/`count` in `src/data/fields/aggregators.ts` were refactored onto the
same helpers — `weightedMeanByDuration` keeps its own loop since it needs
value and duration paired per child, which a filtered array can't preserve.
Doc example added to `plans/02-public-api.md` §2.6-equivalent (aggregator
levels section). All steps below are complete; kept for the research trail.

## Current shape (researched)

- `src/model/field.ts`: `RollUpContext` (lines 68-72) extends
  `FieldContext` (56-61) and adds only `readonly field: FieldKey`.
  `FieldContext.read<T>(entry, key)` (line 59) reads one field off one
  entry. `Aggregator<TValue>` (74-79) is
  `(children, parent, ctx) => TValue | undefined`.
- `src/data/fields/field-access.ts`: `createFieldContext` (46-64) builds the
  `ctx.read` implementation — looks up the `Field`, returns `undefined` if
  missing, else dispatches through `strategyFor(field.source).read(...)`.
- `src/data/fields/aggregators.ts`: shipped `min`/`max`/`sum`/`count`/`none`/
  `weightedMeanByDuration`, using local helpers `readNumber` and
  `foldNumbers` that already encode the hole-skipping rule the issue wants
  reused. `SHIPPED_AGGREGATORS` (66-73) is the registry consumer
  aggregators are merged over (`field-registry.ts:45`).

So the hole-skipping logic already exists once, in `aggregators.ts`, but
it's private to the shipped aggregators — `RollUpContext` gives consumers
no shortcut to it.

## Plan

### Step 1 — Design the `RollUpContext` helper surface
Add to `RollUpContext` (`src/model/field.ts`), scoped to the field the
rollup is currently running for (`ctx.field`), matching the issue's
proposal:
- `values(children: readonly Entry[]): (unknown | undefined)[]` — read the
  current field off each child.
- `numericValues(children: readonly Entry[]): number[]` — like `values`,
  but skips holes and non-numeric values the same way shipped
  `sum`/`min`/`max` do today.

Keep the full `(children, parent, ctx)` signature and `ctx.read` untouched
— multi-field / non-numeric aggregators still need them (explicitly out of
scope to remove per the issue).

### Step 2 — Implement in `field-access.ts`
Add the two methods to `createFieldContext`'s returned object, built on the
same `read`/`strategyFor` path already used — no second read path, per
D-S4-8 (one path for shipped and consumer aggregators).

### Step 3 — Refactor shipped aggregators to use the new helpers
Rewrite `sum`/`min`/`max`/`count` in `src/data/fields/aggregators.ts` in
terms of `ctx.numericValues(children)` (or `ctx.values` for `count`),
retiring the now-duplicate `readNumber`/`foldNumbers` local helpers where
the new context methods cover them. This makes the acceptance criterion
"shipped and consumer aggregators share one path" literally true, not just
behaviorally similar.

### Step 4 — Docs
Add one short custom-aggregator example to `plans/02-public-api.md` (or
wherever `DatasetOptions.aggregators` is documented) using
`ctx.numericValues`, replacing/complementing the manual-loop example from
the issue body.

### Step 5 — Tests
- Existing aggregator tests must still pass unchanged (shipped aggregators'
  external behavior doesn't change).
- New unit tests for `ctx.values`/`ctx.numericValues` directly: hole
  skipping, non-numeric skipping, empty `children` array, and a
  single-field custom aggregator (like the `riskWeighted` example in the
  issue can't use `numericValues` alone since it needs two fields — good
  case to keep the full-signature path exercised too).

## Acceptance
- A single-field numeric custom aggregator is a few lines, no manual child
  loop, using `ctx.numericValues`.
- Shipped aggregators pass existing tests unchanged and now route through
  the same helper.
- Docs show one such example.
