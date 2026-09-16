# #404 — Ship shading (non-working time) as a first-party plugin

**Reported:** 2026-09-15. **Closed:** 2026-09-15.

## What the issue actually was

FreeGantt had no shipped way to paint a region of the time axis — a weekend, an after-hours
window, a holiday. A consumer wrote a harness-only decoration plugin by hand
(`weekendShading()`), reaching into `time.eachDay`/`time.dayOfWeek`/`time.addDays` itself. The
issue asked for a first-party version, plus the time-facade pieces it needs: `ZonedTime.step`,
`ZonedTime.each`, and a public `PlainTimeInput` for an `hours('17:00', '07:00')`-style boundary.

The issue text names the shipped function `shading()` throughout. That name was reopened once the
builder names and the API decisions below were already settled, and the issue text was never
edited to match. **`timeShading()` is the shipped name** — read `shading` in the issue as
`timeShading` wherever the two disagree.

## Resolution

**`timeShading(rules: readonly ShadingRule[])`** ships from `'freegantt'` — a `ChromePlugin` (no
`data` half), id `freegantt.timeShading`, layer `underBars` always
(`src/extensions/features/time-shading.ts`).

- **`ShadingRule`** is a two-arm union. The first names a `covers: TimeCover | readonly TimeCover[]`
  and forbids `every` (`every?: never` — load-bearing against TypeScript's excess-property check,
  or `{ covers: daysOfWeek(6, 7), every: 'day' }` would compile with `every` silently ignored). The
  second names `covers: CoverPredicate` and requires `every: TimeUnit`, asked once per step —
  `{ every, covers }`, not `{ every, from }`. Both arms take an optional `hideWhenCoarserThan` and
  `class`.
- **`TimeCover`** answers `coveredSpans(window, time): readonly TimeSpan[]`. Five builders ship
  (`src/extensions/features/time-shading-covers.ts`): `daysOfWeek()`, `hours()`, `dates()`,
  `spans()`, `notCovered()`. A list of covers means their union; there is no `anyOf` export.
- **`hours(from, to)`** resolves both boundaries through `ZonedTime.fromPlain` and adds no time
  arithmetic of its own, wrapping midnight when `to` reads earlier than `from`.
  `ZonedTime.fromPlain` is `disambiguation: 'compatible'`, so a plain time that does not exist on a
  spring-forward day resolves forward by the gap size — a fact `time/zone.ts` had already decided,
  not a ruling this issue makes.
- **The zoom-default floor (D-H).** A rule hides when `isCoarserThan(tickUnit, floor) ||
  tickIncrement !== 1`. `daysOfWeek`/`dates` floor at `day`; `hours` (and a predicate rule) floors at
  its own walk unit; `spans()` never hides. A list floors at the **coarsest** of its members — the
  floor is a hide threshold, and flooring on the finest member would hide the whole rule the moment
  any one member wants a finer zoom. `notCovered()` inherits its inner cover's floor.
  `hideWhenCoarserThan` overrides whatever the shape would otherwise pick.
- **Merge.** `mergeSpans()` folds touching and overlapping spans into one run before painting, so a
  weekend is one `rangeBand`, not two meeting at a hairline.
- **Style.** Every band carries `.fg-time-shading` beside a rule's own `class`, so the zero-CSS
  default (`--fg-time-shading-fill`) always applies and a rule's own class still tells two rules'
  bands apart.
- **`{ covers: [] }` throws `EmptyCoversError`**, at plugin construction, on a rule that names an
  empty list.
- **Reconfiguring is two calls, not one.** `gantt.plugins = [timeShading(next)]` diffs by id;
  `timeShading()` always mints `freegantt.timeShading`, so a plugin present in both lists under that
  id is left alone. The call-site doc on `timeShading()` states the uninstall/install pair this
  needs.

## What did not change

- No per-row shading — `RowStripe` already exists and this issue never asked for it.
- No collapsing of non-working time; that is a non-linear `TimeScale` (`plans/00`), out of scope.
- No shared-axis declaration for shading.
- The public surface never names what a shaded region *means* ("non-working time," "weekend"). The
  library states what a band *is*; a rule's `class` and a consumer's own CSS state what it means.
  This holds in the JSDoc on `timeShading()`, the CSS comment on `--fg-time-shading-fill`
  (`src/view/styles.ts`), `docs/architecture/files.md`'s row for the file, and the `CONTEXT.md`
  glossary entry.
- `harness/plugins/weekend-shading.ts` is deleted. `harness/main.ts` and `harness/plugins.html`
  install the shipped `timeShading()` instead, with `harness/planner.ts` themeing its own rule
  through `class: 'planner-weekend'` (level 2 of the Customization ladder) rather than through
  `harness-chrome.css`.
- `harness/plugins/over-budget-rows.ts` is a real, unrelated third-party-style plugin that survives
  in `harness/plugins/`, dogfooding `RowStripe` the way `timeShading()` dogfoods `rangeBand`.

## Tests

Every acceptance box below names its pinning test.

- `timeShading()` exports from `'freegantt'`, chrome-only, `freegantt.timeShading`, and a `data`
  half does not typecheck into `GanttOptions.plugins` — `src/extensions/features/time-shading.test.ts`,
  `'id is freegantt.timeShading, and it fills only the view half'`; `'a data-half plugin does not
  typecheck into GanttOptions.plugins (ChromePlugin has data?: never)'`.
- `{ covers: <a cover>, every: 'day' }` does not typecheck — `time-shading.test.ts`, `"{ covers:
  aCover, every: 'day' } does not typecheck — every?: never refuses it on the cover arm"` and the
  list-arm twin, `"{ covers: [aCover], every: 'day' } does not typecheck either"`.
- `{ covers: fn }` with no `every` does not typecheck; `{ every: 'day', covers: fn }` infers
  `Instant` — `time-shading.test.ts`, `'{ covers: fn } with no every does not typecheck'` and `"{
  every: 'day', covers: fn } compiles, and fn's argument infers Instant"`.
- `PlainTimeInput` is a real public type, carried by the api report — `src/model/time.ts`,
  re-exported `src/api/index.ts` and `src/model/index.ts`; `etc/freegantt.api.md` lists it.
- `ZonedTime.step`/`ZonedTime.each` exist and `api/time-facade.ts` reaches them —
  `src/time/zoned-time.test.ts`, `'step() forwards to the same zone-aware stepping zone.ts already
  has, default increment 1'`, `'each() walks every unit boundary in the span, matching eachDay for
  "day"'`; `src/api/time-facade.ts` re-exports `ZonedTime`.
- `hours('17:00', '07:00')` wraps midnight — `time-shading-covers.test.ts`, `'wraps midnight — the
  evening reading until the next morning reading'`.
- `hours()` resolves through `ZonedTime.fromPlain` with no arithmetic of its own, 13/15 hours across
  both DST boundaries — `time-shading-covers.test.ts`, `'resolves both boundaries through
  ZonedTime.fromPlain, adding no arithmetic of its own — 13 hours across the spring-forward
  transition'` and `'measures 15 hours across the fall-back transition, still ending on the 07:00
  reading'`.
- A plain time that does not exist on a spring-forward day resolves forward —
  `time-shading-covers.test.ts`, `'a plain time that does not exist on the spring-forward day
  resolves forward by the gap size (fromPlain, disambiguation: compatible)'`.
- Shading paints at the default ladder's two hour rungs (`hour`, `hourDayWeek`), e2e —
  `e2e/plugins.spec.ts`, `'[#404] timeShading() still paints at both hour zoom rungs'`.
- Each builder is unit-tested in a non-UTC zone across both DST boundaries, a 23-hour and a 25-hour
  day each shading their true width — `time-shading-covers.test.ts`: `daysOfWeek()`'s `'shades the
  spring-forward day (23 hours)...'`/`'...fall-back day (25 hours)...'`; `hours()`'s two DST tests
  above; `dates()`'s `'shades each named calendar day whole, across a DST boundary'`.
- Adjacent covered spans merge into one rect with no hairline —
  `time-shading.test.ts`, `'paints one rangeBand per merged run, carrying .fg-time-shading beside
  the rule class'`; `time-shading-covers.test.ts`, `'shades every matching ISO weekday, merged into
  one run over a weekend (no hairline)'` and `'merges touching and overlapping spans into one run'`.
- The zoom-defaults table is pinned by test, and `hideWhenCoarserThan` overrides it —
  `time-shading.test.ts`, the whole `'the zoom-default floor (D-H)'` describe block: `'daysOfWeek
  hides above day zoom'`, `'hours hides above hour zoom'`, `'spans() never hides on granularity, at
  any tick unit with increment 1'`, `"a rule's own hideWhenCoarserThan overrides the cover's own
  default"`.
- `{ covers: [daysOfWeek(6, 7), hours('17:00', '07:00')] }` still paints the weekend at day zoom —
  `time-shading.test.ts`, `'a mixed list floors at the coarsest member — the weekend still paints at
  day zoom beside an hour cover'`.
- A list of covers unions them, `notCovered()` takes the same list, `{ covers: [] }` throws, and
  there is no `anyOf` export — `time-shading.test.ts`, `'a list of covers unions them into one
  rule'`, `'notCovered() shades everything the inner cover does not'`, `'throws EmptyCoversError for
  { covers: [] } on a rule, at plugin construction'`; `time-shading-covers.test.ts`, `notCovered()`'s
  `'takes a list the same way a rule does, and floors at the coarsest member'` and `'throws
  EmptyCoversError on an empty list — there is no complement to compute'`.
- A tick at the floor unit with `tickIncrement > 1` hides the rule — `time-shading.test.ts`, `'a tick
  at the floor unit with tickIncrement above 1 still hides'`.
- Reassigning `gantt.plugins` with a fresh `timeShading()` applies the new rules: the setter matches
  the occupant by id, then replaces it because the object differs (review F4) —
  `plugin-runtime.test.ts`, `'a fresh instance under an installed id replaces it, old disposed
  first'`; `time-shading.test.ts`, `'two timeShading() calls with different rules both mint the same
  plugin id'`. One assignment, no uninstall/install pair.
- The harness plugins page installs the shipped `timeShading()`; a third-party decoration plugin
  survives in `harness/plugins/` — `harness/plugins.html`/`harness/plugins.ts` install
  `timeShading()`; `harness/plugins/over-budget-rows.ts` is the survivor.
- e2e: shading paints, and the toggle removes it live with no remount (I8) — `e2e/plugins.spec.ts`,
  `'[#404] weekend bands appear, follow a pan, and a checkbox removes the plugin live'`.
- `docs/06-plugin-authoring.md`'s Decorations example, `docs/architecture/files.md`'s row,
  `CONTEXT.md`'s glossary entry, and the Token list all name `timeShading()`'s shipped Part and
  Token; the api report carries the public surface — `pnpm check-doc-examples`, `pnpm api-report`.
- `verify:full PASS`, reported from the last line of the run — see the PR description.

## Acceptance

`timeShading()` ships from `'freegantt'` with its five `TimeCover` builders, floors correctly at
every zoom rung the default ladder reaches, merges adjacent spans with no hairline, and never names
what a shaded region means on the public surface. The harness demonstrates the zero-CSS default
(`index.html`, `plugins.html`) and a themed override through a rule's own `class`
(`planner.html`/`planner.ts`). `weekendShading()` is retired.
