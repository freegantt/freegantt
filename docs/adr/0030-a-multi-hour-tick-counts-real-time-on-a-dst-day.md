---
status: accepted — ruled 2026-09-23 by the maintainer, out of the `Pawel-IT/api-check` review.
decided: On a DST-transition day, a tick with `increment > 1` counts real elapsed time from the
start of its day. The tick keeps equal real spacing. It does not snap back to a wall-clock multiple
until the next day starts. A 6-hour tick reads 00/07/13/19 on a spring-forward day.
open: none. Reopen if a consumer reports the odd labels as a defect.
---

# A multi-hour tick counts real time on a DST day

## Context

`tickFloor` and `nextTick` (`src/time/zone.ts`) are the one tick walk. `TimeScale.ticks`,
`snapInstant` and `nextTickBoundary` all read it, so a gridline and a drag snap always agree.

For `increment > 1`, the walk starts at the start of the tick's day. It then steps `increment` real
units. On most days, real time and wall time agree, so the ticks read 00/06/12/18. On the two DST
days of a year, they disagree by the size of the shift.

`America/Denver`, from `origin/main` on 2026-09-23:

| Day | `hour`, increment 6 | `hour`, increment 12 |
|---|---|---|
| 2026-03-08 (spring forward) | 00:00, 07:00, 13:00, 19:00 | 00:00, 13:00 |
| 2026-11-01 (fall back) | 00:00, 05:00, 11:00, 17:00, 23:00 | 00:00, 11:00, 23:00 |
| The next day | 00:00, 06:00, 12:00, 18:00 | 00:00, 12:00 |

A review of the last day's merges flagged this as a defect. A 6-hour header reads 13:00 where a
reader expects 12:00.

## Evidence

**We tried the fix twice.** Both attempts worked, and both cost more than the defect.

1. A walk that stepped one real hour, and then one real minute, until the wall reading was a
   multiple. It was correct. It made one year of 6-hour ticks take 2686 ms, against 51 ms on
   `main`. Its first form also broke `Australia/Lord_Howe`, where DST shifts by 30 minutes. The
   property tests caught that only on some seeds.
2. Temporal's own wall-clock rounding: `ZonedDateTimeFns.roundToHour` with `roundingIncrement`.
   It was fast: 18 ms for the same year. But it needs three rules to keep the walk
   correct. One rule steps through a fold, one skips a gap tick, and one keeps a fold's repeated
   readings for minute ticks. Every rule adds a DST path that only two days of the year exercise.

**No comparable library does better.** Each one below builds its time axis on JavaScript `Date` in
the browser's zone.

| Library | What a DST day does |
|---|---|
| DHTMLX Scheduler | The hour scale can repeat `01:00` for the whole day. Drag snaps to the first repeat ([forum](https://forum.dhtmlx.com/t/timeline-day-view-has-not-coped-with-daylight-savings/32095)). |
| Bryntum Scheduler | Support says there is "no simple way around" a DST gap. They advise against adding or removing ticks ([forum](https://forum.bryntum.com/viewtopic.php?t=25296)). |
| FullCalendar | The skipped spring hour still shows as a slot ([#7620](https://github.com/fullcalendar/fullcalendar/issues/7620)). |

FreeGantt already does more than these. It keeps the tick count correct, it keeps equal real
spacing, it never repeats a label, and it re-anchors at the next midnight.

## Decision

On a DST-transition day, a tick with `increment > 1` keeps counting real elapsed time from the start
of its day. The walk does not re-align to a wall-clock multiple inside that day.

`increment: 1` does not change. Each hour tick sits on a real top of hour, so a gap drops one label
and a fold repeats one label, as the wall clock does.

## Consequences

**Two days a year show odd labels.** A 6-hour header in a DST zone reads 07/13/19 in spring and
05/11/17/23 in autumn. The last cell of the autumn day is one hour wide. The next day reads
00/06/12/18 again.

**The grid and the snap still agree.** One walk answers both, so a bar dropped on 13:00 lands on the
13:00 gridline.

**The tick walk stays arithmetic.** It is one `stepBy` per tick, with no search and no per-zone
special case. A zone with a 30-minute shift, such as Lord Howe, needs no extra rule.

**A test must not assert wall-clock multiples on a DST day.** A test of `increment > 1` asserts
equal real spacing and agreement with `snapInstant`. It does not assert that every label is a
multiple of the increment.
