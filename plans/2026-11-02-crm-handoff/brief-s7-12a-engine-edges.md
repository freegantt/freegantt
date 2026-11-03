# Brief S7.12a: the engine keeps a resized edge, and FS plus FF holds with a calendar

Read `common-rules.md`, `wave-2-rules.md` and `wave-3-rules.md` first. Slice name: `s7-12a-engine-edges`. Port: 5341. This blocks the 0.2.0 release.

Source: `review-0-2-0.md`, blockers B1 and B4, and finding O4. Read those rows first. Each one has a concrete failing case.

## Change

1. **B1, failing test first.** Entry `[d0,d2]` with only its end proposed at d5 schedules to `[d0,d5]`, not `[d3,d5]`. A start-only proposal keeps the end and writes no "start no earlier than" floor unless the existing rule asks for one. A grid edit of `end` behaves as an end resize. A drag-move (both edges) stays a move.
2. **B1 fix** in `src/scheduling/schedule.ts` (near line 136). Make the `ScheduleRequest.proposed` doc comment true for every case: say exactly which proposal shape means a move and which means a resize.
3. **B4, failing test first.** The Mon–Fri case in B4: FS wants start ≥ Mon, FF wants end ≥ Fri. Both Dependencies hold after scheduling.
4. **B4 fix** in `src/scheduling/propagate.ts` `chooseShift`. Compare the start demand and the end demand in the unit the length is kept in (working time when a calendar is set). Do not copy the calendar rule; use the existing working-calendar functions.
5. **O4:** add calendar goldens for FF, SF and `follow(…, 'end')` in `src/scheduling/golden/`.
6. `CHANGELOG.md` lines under `### Fixed` in `[0.2.0]` (not yet published).

## Constraints

- Do not touch `src/extensions/features/scheduling.ts` (S7.12b works there) or `src/render/`.
- Atomic commits: one per fix, each with its test.
- If a fix changes an ADR rule, `ask` first.
