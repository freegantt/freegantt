# Brief S7.5: the working calendar

Read `common-rules.md` and `wave-2-rules.md` (same folder) first. Slice name for your progress file: `s7-5-working-calendar`.

## Target

Read the S7.5 section of the PR #667 README, and `decisions.md` rulings 12, 12a, 12b, 13.

- `src/scheduling/working-calendar.ts` and its tests.
- One export line in `src/scheduling/index.ts` and in `src/api/index.ts`.
- A harness page, or a change to the existing weekend-shading page, that shows the calendar.
- Read: `src/extensions/features/time-shading.ts`, `src/extensions/features/time-shading-covers.ts` (`TimeCover`, `daysOfWeek`, `dates`), `.dependency-cruiser.cjs` (the `scheduling-boundary` rule), `src/time/zone.ts`.

## Change

```ts
const calendar = workingCalendar({ workdays: [1, 2, 3, 4, 5], holidays: ['2026-12-25', '2026-12-28'] });
timeShading([{ covers: calendar.offTime(), class: 'off' }]);
```

1. `workingCalendar({ workdays, holidays })` returns an immutable `WorkingCalendar`. A new calendar is a new object.
2. It answers three questions in the Dataset's zone: `isWorkday(day, time)`, `addWorkdays(instant, count, time)`, `workdaysBetween(a, b, time)`. Negative counts are legal. Use point arithmetic, never a window scan.
3. `calendar.offTime()` returns an object of the `TimeCover` shape (`hideWhenCoarserThan`, `coveredSpans(window, time)`). `scheduling/` may import `time/` and `model/` only, so match the shape structurally. Add a type test in `src/api/` that proves the result is assignable to `TimeCover`.
4. The library ships no holiday list.
5. The calendar is optional everywhere. Nothing in core reads it.
6. **Harness:** one calendar object shades weekends and two holidays through `timeShading()`. Use the public API only (the Stop rule).

## Constraints

- Do not touch `src/time/` or `src/extensions/`. If `timeShading()` cannot take the result, stop and `ask`.
- No `scheduling()` plugin in this slice. No propagation. S7.6 owns the engine and other files in `src/scheduling/`.
- `WorkingCalendar` is the glossary's reserved term. Use it.

## Observable acceptance

- Unit tests for each question, including a DST day and a holiday on a weekend.
- A property test: `isWorkday` agrees with `offTime()` over random windows, zones and DST days.
- The harness page shows weekends and holidays from one object.
- `CHANGELOG.md` line.
