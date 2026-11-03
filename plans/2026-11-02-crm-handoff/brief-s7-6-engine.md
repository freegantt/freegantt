# Brief S7.6: the pure propagation engine

Read `common-rules.md` and `wave-2-rules.md` (same folder) first. Slice name for your progress file: `s7-6-engine`.

## Target

Read the S7.6 section of the PR #667 README, `plans/03-slices.md` § S7 (scope and acceptance), `plans/01-domain-architecture.md` §7, `plans/01` §2.5 (kind semantics), ADR 0002, ADR 0028, and `decisions.md` rulings 12a and 16.

- `src/scheduling/` (except `working-calendar*.ts`, which S7.5 owns): `schedule()`, its request and result types, `SchedulingPolicy`, `defaultPolicy`, diagnostics.
- Golden fixtures (a folder beside the engine, or under `fixtures/`; follow the repo's fixture convention).
- Export lines in `src/scheduling/index.ts` and `src/api/index.ts`.

## Change

1. `schedule(request) → { patch, diagnostics }`. Pure and deterministic. A worklist loop; never recursion.
2. The request carries its own edge shape `{ id, fromId, toId, type: 'FS' | 'SS' | 'FF' | 'SF', lag: Duration }`, defined in `scheduling/`. The `entryDependencies()` plugin (S7.2, later) maps its rows to it. Negative lag is legal.
3. Days are 24-hour days in this slice. Put all day arithmetic behind one internal function, so S7.8 can pass an optional `WorkingCalendar` later. The calendar is optional: no calendar means calendar days.
4. Cycles: report a diagnostic that names the exact member Entry ids. Never loop forever.
5. Pins: a pinned Entry never moves. The engine reports what it would have done.
6. `SchedulingPolicy` and `defaultPolicy` per `plans/01` §7: `resolveEdit` (proposed fields decide what moves), precedence `pinned > dependency`. Dev-assert that a proposed field is never overwritten (I4).
7. The engine moves children and stops. Span rollup stays `data/`'s commit step.
8. Golden fixtures: all four types, lag mixes (negative too), pinned conflicts, cycles, deep chains, and a 5,000-link chain with no recursion-depth failure.

## Constraints

- `scheduling/` imports `time/` and `model/` only (dependency-cruiser `scheduling-boundary`).
- No plugin, no extender, no harness wiring in this slice. S7.7 does that. The engine must stay usable without any plugin installed.
- Name every public type with the `naming` skill. Check `CONTEXT.md` for Diagnostic, Pin, Schedule result.

## Observable acceptance

- All golden fixtures pass. The 5,000-link chain passes.
- Coverage of `src/scheduling/` engine files above 90%.
- `pnpm verify` passes, including `check-crap` if it runs on these files.
- `CHANGELOG.md` line (new public export).
