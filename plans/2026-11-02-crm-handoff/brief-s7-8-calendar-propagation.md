# Brief S7.8: the working calendar in propagation

Read `common-rules.md`, `wave-2-rules.md` and `wave-3-rules.md` first. Slice name: `s7-8-calendar-propagation`. Port: 5307.

## Target

Read the S7.8 section of `plans/s7-dependencies-and-scheduling/README.md`, `decisions.md` (12, 12a, D5, D8), `src/scheduling/working-calendar.ts`, the engine in `src/scheduling/` and `scheduling()` in `src/extensions/features/scheduling.ts`.

## Change

1. The engine's request takes an optional `WorkingCalendar`. All day arithmetic already sits behind one internal function; route it through the calendar when one is given. Lags count workdays (ruling D5: days only). A move keeps the Entry's duration in workdays.
2. No calendar: 24-hour days, exactly as today. Every existing golden fixture passes unchanged.
3. `scheduling({ calendar })` takes the same `WorkingCalendar` that `timeShading()` takes.
4. Optional per-Entry calendars (README decision 13): `calendars` (a record of named calendars) and `calendarField` (a consumer Field key whose value names one). An Entry with no value, or an unknown name, uses `calendar`, then 24-hour days. Pick the lag calendar the way P6 does by default: the successor's calendar. Say so in a doc comment.
5. Golden fixtures: lag over a weekend, lag over a holiday, negative lag over a weekend, two Entries on two calendars, no calendar.
6. **Harness:** on the "Scheduling" page, one calendar object shades weekends and two holidays through `timeShading()` and drives `scheduling()`. Drag a predecessor so the successor crosses a holiday; the successor skips it, and the skip matches the shading. E2e.
7. `CHANGELOG.md` lines, API report.

## Constraints

- `scheduling/` imports `time/` and `model/` only. Worklist, no recursion. The 5,000-chain test stays green and does not get much slower; report its time before and after.
- The calendar stays optional everywhere (ruling 12a).
