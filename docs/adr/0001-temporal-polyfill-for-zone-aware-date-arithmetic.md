# Use `temporal-polyfill` for zone-aware date arithmetic

D6 puts every day boundary, week start, and snap through the dataset's IANA zone, so `time/zone.ts` has to convert between Instants and plain (wall-clock) times correctly in any zone. The original hand-rolled implementation (`Intl.DateTimeFormat.formatToParts` plus fixed-point iteration) had no *documented* behavior for the two cases that matter — a DST fold, where a plain time is ambiguous (1:30 AM on the fall-back day happens twice), and a DST gap, where it does not exist at all (2:30 AM on the spring-forward day). It resolved them incidentally rather than deliberately, and nothing tested which way. We adopted `temporal-polyfill` because it implements Temporal's explicit disambiguation model (`compatible` / `earlier` / `later` / `reject`), which turns fold and gap from undefined behavior into a policy we chose and can test.

This is a deliberate exception to the one-runtime-dependency budget, and the second dependency the project has ever taken.

## Considered options

- **Keep the hand-rolled `formatToParts` implementation.** Zero dependencies, but we would have had to specify and implement fold/gap semantics ourselves — the genuinely hard part — and every future calendar unit (month, year) would repeat that work.
- **`@js-temporal/polyfill`.** Right shape and the most conservative semantics, being the reference polyfill, but it does not tree-shake (single class hierarchy) and costs ~2.3–2.9x the gzipped size of `temporal-polyfill`'s `/fns/*` build for the same need.
- **`luxon` / `date-fns` + `tz` / `dayjs`.** None expose explicit fold/gap disambiguation control, which was the whole reason for the change.
- **`d3-time`.** Does its arithmetic in the environment's local zone or UTC only — structurally incapable of working in an arbitrary dataset-owned zone, which is exactly what D6 requires.

## Consequences

- **The escape hatch stays open.** Only `time/zone.ts` imports the package, via `/fns/*` entry points, and `time/`'s public surface (`instant`, `toPlain`, `fromPlain`, `startOfDay`, `addDays`, `diffDays`) did not change. Swapping to native `Temporal` when it ships is a one-file change. Header and a11y date formatting go through `Intl.DateTimeFormat` directly, not the polyfill's `toLocaleString`, so that single-import-site consequence still holds; `weekOfYear` is the one new polyfill call, and it lives in `zone.ts` (S1.12, D-S1.12-13).
- **Accepted bus-factor risk.** ~95% of the package's commits come from a single maintainer. We took this knowingly rather than by oversight; the pin is `^1.0.4` (not exact) so patch and minor updates — security fixes included — land automatically and are caught by the DST fold/gap and multi-zone round-trip tests in `zone.test.ts` before merge.
- **One live workaround.** `temporal-polyfill@1.0.4`'s zoned day-unit diff throws (`prepareZonedEpochDiff is not a function`) in every zone, UTC included — a packaging bug in that build. `diffDays` routes through `PlainDate.diffDays` instead, which is exact there because both operands are already calendar day-starts. Re-check this when the version bumps.

Full dependency reasoning, including the rejected candidates above, is in `plans/04` §1 and §1.1.
