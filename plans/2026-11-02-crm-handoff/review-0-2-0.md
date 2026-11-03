# Review: 0.2.0 release branch

Branch: `origin/Pawel-IT/Sscheduling-Work` at `3b797dcc`, diffed against `origin/main`.
Reviewers: a manual review of all non-test `src/` and `harness/` changes, plus the `ocr` CLI (session `71c034e5-c58f-444b-a8b7-34e6a10861d0`).

## Summary

- **Four defects block 0.2.0.** All four are in the scheduling plugin or the scheduling engine. A throwaway probe test proved each one. I deleted the probes after the run.
- **ocr findings:** 42 at report time. 14 are real and worth fixing, 7 are plausible, 2 are wrong, and 19 are nits (skipped). Two of the 14 match blockers B1 and B2. The ocr run was still in progress when I wrote this report. A finding that lands later is not verified here.
- **Gates on the branch:** `typecheck`, `lint`, `boundaries`, `sentence-length` and `guards` all pass.
- **Project rules:** No harness code works around a gap in `src/`. No spec label occurs in code, tests or `harness/`. The invariant ids (`I1`, `I8`) are legal by the guard. No layer boundary is broken.

## Blockers (must fix before 0.2.0)

| # | Where | Verdict | Failure |
|---|---|---|---|
| B1 | `src/scheduling/schedule.ts:136` | CONFIRMED (probe; ocr found it too) | A resize proposes one edge, but the engine reads a one-edge proposal as a move. Entry `[d0,d2]` with its end resized to d5 becomes `[d3,d5]`, not `[d0,d5]`. A start resize also moves the end, and it writes a "start no earlier than" floor. A grid edit of `end` fails the same way. |
| B2 | `src/extensions/features/scheduling.ts:608-620` | CONFIRMED (probe; ocr found it too) | `setConstraint` sets `applyingConstraint` only inside the transaction body. The row writer and the extender run at commit, after the flag is false again. `setConstraint('a', SNET d3)` on chain a→b→c leaves "start no earlier than" floors on b and c. Clear a's constraint and drag a back: b and c stay late, and pushAndPull cannot pull them back. |
| B3 | `src/extensions/features/scheduling.ts:283-301` (`place`) | CONFIRMED (probe; manual find) | A Dependency overrules a user drag, so `place()` runs the engine again with the overruled proposal removed. When that was the only proposal, the map is empty, and the engine does a full recompute. A full recompute pulls every successor in the plan to its earliest date. Plan x→y, with y placed 5 days late on purpose, and p→q. Drag q before p ends: q lands correctly, but unrelated y moves from d6 to d1. |
| B4 | `src/scheduling/propagate.ts:274-286` (`chooseShift`) with a working calendar | CONFIRMED (probe; manual find) | `chooseShift` compares a start demand and an end demand in elapsed milliseconds, then keeps the length in workdays. Across a weekend, the larger elapsed shift is not always the larger shift in workdays. Mon–Fri calendar, successor s Fri–Tue (3 workdays). An FS demand wants start ≥ Mon. An FF demand wants end ≥ Fri. Result: s = Mon–Wed, end Thu 00:00, so the FF Dependency breaks, and no diagnostic reports it. |

The fix for B1 must also make the "start with no end means a move" comment on `ScheduleRequest.proposed` true. A drag-move proposes both edges, so today the engine sees a move only from a start resize.

## ocr findings: real (14)

Most severe first. The four blockers above come first in this list.

| # | Where | Verdict | Failure |
|---|---|---|---|
| O1 | `src/scheduling/schedule.ts:136` | CONFIRMED | Same as B1. |
| O2 | `src/extensions/features/scheduling.ts:608` | CONFIRMED | Same as B2. |
| O3 | `src/render/dom/decorations.ts:66-68` | CONFIRMED | Decoration nodes are keyed by array index, and `patch` does not reset the inline `width` or the text when the node kind changes. A scroll that drops a `rowSpan` recycles its node as a stripe or a band. The stripe keeps the span's width and text. |
| O4 | `src/scheduling/golden/calendar.golden.ts:4` | CONFIRMED | Every calendar golden drives a start (FS). FF/SF with a calendar and `follow(…, 'end')` have no golden. B4 lives on this path. |
| O5 | `src/extensions/features/scheduling.ts:329-332` | CONFIRMED (perf) | `extend()` runs on every drag-preview frame. Each frame runs a whole-plan `calculateFloat()` and then discards the float writes. That is a second full-graph pass per frame on the hot path. |
| O6 | `src/extensions/features/scheduling.ts:557-561` | CONFIRMED (perf) | Every change set runs a full `schedule()` audit. That includes the plugin's own `float`/`critical` sync write, which changes no date. |
| O7 | `src/extensions/features/scheduling.ts:449-450` | CONFIRMED (perf) | `queuePushAfterSync` does not coalesce. N sync change sets in one turn queue N full `schedule()` runs and N sync writes. |
| O8 | `src/scheduling/working-calendar.ts:42` | CONFIRMED | `'invalid-working-calendar'` is not in the closed `BuiltInThrownCode` union, so an exhaustive `switch (error.code)` in a consumer misses it. |
| O9 | `src/scheduling/float.ts:52-53` | CONFIRMED | `projectFinish` reads loop members' ends nowhere, although the doc says "latest finish of all scheduled Entries". A loop member that ends last gives a project finish that is too early. |
| O10 | `src/extensions/features/entry-dependencies-selection.ts:82` | CONFIRMED | The five `registerKeyHandler` disposers are dropped. After uninstall, Delete or an arrow on a connector calls a disposed plugin, and `all()` throws `DependencyStoreNotInstalledError`. |
| O11 | `src/extensions/features/entry-dependencies.ts:254-256` | CONFIRMED | The async `beforeDependencyRemove` path has no `catch`. A rejected handler Promise, or a throw in `commit`, gives an unhandled rejection. |
| O12 | `harness/dependencies.ts:62-63` | CONFIRMED | Click "Remove Foundation 2", then click "Replace" twice. The second `replaceAll(firstDependencies)` throws `EntryNotFoundError`. The page flag then names the wrong set. |
| O13 | `harness/dependencies.ts:78-80` | CONFIRMED | A second click on "Remove Foundation 2" throws `EntryNotFoundError` into the console. |
| O14 | `harness/plugins/related-to.ts:48-50` | CONFIRMED | Pairs live on the `from` row only. Remove the `to` Entry and the pair stays in the store. The line comes back if an Entry with that id returns. This is the reference plugin, so readers copy the gap. |

## ocr findings: plausible (7)

| Where | Why not proven |
|---|---|
| `harness/related-to.ts:28` | Seeded `relate()` calls may land in History, so Undo removes a seeded line. I did not check whether a store write outside a transaction records a step. |
| `scripts/measure-scale.mjs:144`, `:310`, `:311`, `:358` | Four measurement-quality claims about a dev script: no timeout on the hover probe, the heap read after the bulk edits, the tracing overhead, and the first frame timing. Not run. |
| `src/extensions/features/entry-dependencies-selection.ts:61-63` | `findIndex` → `-1` sends focus to the first connector. This needs a focused connector whose Dependency has gone before the repaint. |
| `src/render/dom/connectors.ts:32-36` | `freeMarkerId()` finds only ids already in `document`. Two Gantts mounted into detached containers both get `fg-connector-arrow-0`. |

## ocr findings: rejected (2)

| Where | Why |
|---|---|
| `src/scheduling/day-counting.ts:81-82` (SF with a calendar, rated high) | Wrong. For SF lag 0, the predecessor starts Monday and the successor end lands at Saturday 00:00. In working time that equals Monday 00:00, because no workday lies between them. `settle('end', Mon 00:00)` also gives Saturday 00:00, so the engine never pulls past it. |
| `src/scheduling/float.ts:91` (SF late start, rated medium) | Wrong for the same reason. A late end of Saturday 00:00 settles to a Monday start, and that start sends the successor end back to Saturday 00:00. The Dependency holds, so float is not overstated. |

## ocr findings: nits (19, skipped)

`harness/plugins/related-to.ts:31`, `:38`; `harness/dependencies.ts:55`; `harness/scheduling.html:58`; `harness/scheduling.ts:72`, `:87`, `:117`; `src/scheduling/golden/scenario.ts:38`, `:89`, `:108`; `src/scheduling/schedule.ts:139`; `src/scheduling/working-calendar.ts:131`; `src/scheduling/propagate.ts:150` (an epoch-0 floor only); `src/scheduling/float-graph.ts:80`; `src/extensions/features/entry-dependencies.ts:132`; `src/extensions/features/scheduling.ts:201`, `:595`; `src/render/dom/connectors.ts:199`; `src/render/dom/index.ts:1691`.

## Harness review (stop rule)

- No harness code works around a gap in `src/`. `harness/main.ts` uses `workingCalendar` and `timeShading` through the public API only.
- `harness/related-to.ts` counts `[data-connector-id]` nodes after `requestAnimationFrame`. `harness/performance.ts` already reads the DOM this way, so this is not a new gap. A public read of drawn connectors would remove it.
- `harness/plugins/planned-vs-actual.ts` types `entry` as `{ read(key: string): unknown }` and casts `entry.read('end')` with `as Instant`. `Entry.read('end')` already answers `Instant | undefined`, so the cast is not needed. This is harness misuse, not an API gap.
