# Build log — the seven foot-gun rows under #463

Decisions the coordinator and the implementers made on their own while they closed the seven rows under #463.

## PR 1 — #478, #480, #479

No decision left open. The three issues settled every row's wording.

**Worktree location.** `scripts/create-worktree.sh` puts a worktree at `.worktrees/<issue>-<slug>/`. A stale-worktree sweep from another agent deleted that `.worktrees/` checkout, branch included. PRs 1 and 2 ran in the coordinator's own worktree as a stop-gap. PR #484 then moved the script to `orca worktree create`, so PR 3 onward each run in their own Orca-managed worktree, as the workflow always intended.

## PR 2 — #477

No decision left open. The issue's plan settled the wording, the sites, and the plan-row edit.

**`pr-wait` raced the `ready_for_review` transition.** `open-pr --ready` queued a gate run, but
concurrency (keyed on the branch) cancelled it against the draft-push run's tail end (`docs/04`
§5.2, #415's known shape). No live run remained, so `pr-wait` timed out twice. The documented fix
applied: push a commit so `synchronize` fires, then run `pr-wait` again. This note is that commit.

## PR 3 — #474

**`InvalidPresetError` shape.** A second validator needs a second message. The constructor takes `(presetId, reason)`, and each validator writes its own sentence. The two width fields go, because one code covers one meaning: this preset object is inconsistent.

No other decision left open. The issue's ruling settled the constructor shape, the two rules (unit and increment), and the empty-`headers` pass-through. `harness/main.ts` builds no custom `ViewPreset`, so this guard needed no harness review beyond confirming that.

## PR 4 — #475

**`ZOOM_PRESETS` precedent does not hold at the `api/index.ts` layer.** The issue and the handoff both say the new lists go public "the same way `ZOOM_PRESETS` already is." `ZOOM_PRESETS` is public only through `layout/index.ts` — `api/index.ts:423` says named preset constants stay internal, and `ZOOM_PRESETS` is not re-exported there. The issue's own "export the key lists publicly" answer is unambiguous, so `BAR_FLAG_KEYS`/`LINK_FLAG_KEYS` went public through both `layout/index.ts` and `api/index.ts` anyway; only the cited precedent was wrong, not the decision. Flagged for the coordinator, not treated as a blocker.

**Derived-type shape.** `BarFlags`/`LinkFlags` derive as `Partial<Record<(typeof KEYS)[number], boolean>>`, inline at the type alias, rather than a named mapped-type helper — two call sites don't earn a shared helper, and `etc/freegantt.api.md` prints the resolved `Partial<Record<...>>` shape either way (see the api-report diff in the PR body).

**Doc block columns.** `docs/05-consumer-api.md`'s new `### data-flag` table uses `Selector | Set by` — two columns, since every row today says the same thing (S7 scheduling plugin) and a `Part | Role` table (the existing Parts-list shape) would repeat `.fg-bar`/`.fg-link` as a redundant column.

**Test file and failure message.** `src/render/dom/flag-selectors.test.ts`, beside `dom-contract.test.ts`, copies its `import.meta.url` root resolution. Each assertion carries a custom message: `add a ".fg-bar[data-flag~="<key>"]" row to the data-flag table in docs/05-consumer-api.md` — names the exact row and file, not just a mismatch.

**`.fg-link` does not render yet.** `GeometryFrame.links` (`FrameLink[]`) exists in `layout/frame.ts` but nothing in `render/dom` reads it — no `.fg-link` element paints today, unlike `.fg-bar`'s flag mechanism, which is real even though nothing sets a flag true yet. The issue's "`.fg-link[data-flag~="cycle"]` are live" is stronger than the code supports; the doc row and the guard still stand, since both describe the design S7's plugin will complete, the same way the `.fg-bar` rows already describe a mechanism nothing sets true yet.

Neither of the two findings above blocked the PR; both are recorded here for the coordinator to weigh.

## PR 5 — #476

**Names chosen.**

- `time/snap.ts`'s `nextTickBoundary(zone, at, unit, increment): Instant` — the first whole boundary strictly after `at`. Same shape as `snapInstant`/`stepsBetween` beside it, reuses their `assertAdvances` guard. Call: `nextTickBoundary('America/New_York', at, 'hour', 1)` reads "the next tick boundary, in New York, after `at`, at one hour" — true and matches the ruling's own phrase ("next tick boundary").
- `GanttShellWiring.nextTickBoundaryDelayMs?: (zone, unit, increment) => number` — the port `#syncTodayLineTimer` reads. Call: `wiring.nextTickBoundaryDelayMs(dataset.timeZone, 'hour', 1)` reads "the wiring's delay, in ms, until the next tick boundary of this zone, at hour by one". Named for what it returns (a delay), not `nextTickBoundary` unqualified, once the return type stopped being an `Instant` (see the decision below).
- `GanttShell`'s `#todayLineTimer` field, `#syncTodayLineTimer(header)` and `#clearTodayLineTimer()` methods. `#syncTodayLineTimer` (not `#armTodayLineTimer`) because it always clears first and conditionally re-arms — "sync" names the whole always-run step `render()` takes, "arm" would have named only the half that sometimes runs.
- `MAX_TIMER_DELAY_MS` — `setTimeout`'s own 32-bit-int ceiling, not a `time/` constant (see below).

**Decision made on my own: the wiring port returns a delay in ms, not the boundary `Instant`.** The issue and the handoff both describe the port as carrying "the next-boundary instant." I built it to return `diffMs(nextTickBoundary(...), now())` instead, computed inside `api/gantt.ts` (which may import `time/`). Reason: `view/` may not do `Instant` arithmetic (I10, `eslint/rules/no-instant-arithmetic.cjs`, type-aware and repo-wide). Had the port hand back an `Instant`, `GanttShell` would have needed `boundary - now` to get `setTimeout`'s delay argument, and that subtraction is exactly what I10 bans outside `time/`. Returning the delay keeps every `Instant` arithmetic step inside `time/`/`api/gantt.ts` and leaves `view/` holding a plain number. The behaviour the ruling asks for is unchanged; only which value crosses the wiring boundary differs from the literal wording.

**Bug caught by the test suite, not the ruling: `setTimeout`'s 32-bit ceiling.** `src/api/gantt.test.ts`'s real (unmocked) `preset: 'year'` tests logged `TimeoutOverflowWarning: ... does not fit into a 32-bit signed integer` — a year boundary is often 100+ days out, past `setTimeout`'s ~24.8-day ceiling, and Node/browsers silently clamp an overflowing delay to fire almost immediately. Left unfixed this would have re-armed and re-fired on almost every animation frame for a coarse preset, instead of once at the true boundary. Fixed with `MAX_TIMER_DELAY_MS = 2_147_483_647` (`Math.min(delayMs, MAX_TIMER_DELAY_MS)` in `#syncTodayLineTimer`): a platform limit on `setTimeout` itself, not a calendar constant, so it lives in `view/` beside the one `setTimeout` call, not in `time/`. The next `render()` after an early fire recomputes a fresh (shorter) delay off the real clock, so this converges on the true boundary rather than looping.

**Tests, all in `src/view/gantt-shell.test.ts`'s `GanttShell today line timer (#476)` block** (`dom` project, `vi.useFakeTimers()` + a stubbed `nextTickBoundaryDelayMs`, no real clock read):

1. `a frame painted with todayLine: true arms one timer`
2. `firing the timer paints one frame`
3. `todayLine: false arms no timer`
4. `todayLine pinned to an Instant arms no timer`
5. `destroy() clears the armed timer`
6. `two frames leave one timer, not two`

`src/time/snap.test.ts` also gained a `nextTickBoundary` describe block (pure, 4 cases) covering the walk-forward, the "never returns `at` itself" guard, a multi-step increment, and the zero-increment refusal.

**`harness/main.ts` review.** No clock, timer, or repaint code of any kind — `panToToday()` is its only clock-adjacent line, and that already existed. No workaround to report.

No other decision was left open; the ruling's seven steps settled the arm/clear/re-arm shape, the `false`/`Instant` no-op, and the doc/plan-row wording.
