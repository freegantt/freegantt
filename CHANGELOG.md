# Changelog

This file records every change a consumer of FreeGantt can see. The newest release is at the top.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). FreeGantt has not shipped yet, so a breaking change does not change the major version before 1.0.

## [Unreleased]

### Changed

- **Breaking:** `dataset.entries.sync(rows)` is now `dataset.entries.syncAll(rows)`. The behavior does not change. The new name pairs with `syncChanges`: `syncAll` takes every row, and `syncChanges` takes only the rows that changed. ([#527](https://github.com/freegantt/freegantt/issues/527))
- `dataset.entries.add()`, `load()`, `syncAll()`, `EntryDelta.upsert`, and the `Dataset` constructor's `entries` option now also take a plain `EntryInput<TProps>` row, not only `FlatEntryInput<TProps>`. A function generic over `TProps` can now pass an `EntryInput<TProps>` value straight through, with no cast. ([#527](https://github.com/freegantt/freegantt/issues/527))
- The ingest warning for a flat key that no Field declares now says that the value drops. It also names both fixes: declare the key in `fields`, or nest it as `props: { key }`. ([#524](https://github.com/freegantt/freegantt/issues/524))
- **Breaking:** `formatDate` is now a Formatter: `formatDate(value, ctx)`, date only, `''` for a missing value. It no longer takes an `options` parameter. `ctx` is a `FormatContext` (`{ timeZone, locale }`), where `locale` may be `undefined` as a value. Migrate `formatDate(v, ctx, opts)` to `dateFormatter(opts)(v, ctx)`. ([#577](https://github.com/freegantt/freegantt/issues/577))
- **Breaking:** `HeaderFormat` now takes one `ctx: FormatContext` in place of positional `zone` and `locale`: `(value, ctx) => string`. `formatHour` and `formatWeekNumber` follow, and both give `''` for a missing value. ([#577](https://github.com/freegantt/freegantt/issues/577))
- **Breaking:** The `dateOnlyEnd` Dataset option and the `DateOnlyEndRule` type are removed. A date-only `end` string always means "through that day" now: it stores the start of the next day. Pass a timed string, such as `'2026-09-09T00:00:00'`, for an exclusive end. ([#577](https://github.com/freegantt/freegantt/issues/577))
- **Breaking:** `formatEndInclusive` is removed. Use `formatInclusiveDate` as a Field's `formatValue`, or call `lastCoveredInstant` and pass its result to `formatDate` directly. ([#577](https://github.com/freegantt/freegantt/issues/577))
- The core `end` Field now names the shipped `formatInclusiveDate` as its `formatValue`, in place of a private, unexported formatter that did the same job. ([#577](https://github.com/freegantt/freegantt/issues/577))
- `formatValue` is now a consumer override every core Field accepts, not only `start` and `end`. ([#577](https://github.com/freegantt/freegantt/issues/577))
- **Breaking:** `measureDuration` and `DurationMeasure` are removed. A parent's duration is the span of its rolled-up start and end. The gaps between children count. ([#428](https://github.com/freegantt/freegantt/issues/428))
- **Breaking:** `entry.duration()`, `ComputeContext.duration()` and `RollUpContext.durations()` are removed. Read `entry.read('duration')`, `ctx.read('duration')` or `ctx.values('duration')`. ([#428](https://github.com/freegantt/freegantt/issues/428))
- `duration` is now a normal computed Field. A consumer `formatValue` override works on it as on any other Field. ([#428](https://github.com/freegantt/freegantt/issues/428))
- A bar's accessible label names a one-day bar's date once, instead of reading it twice as a start and an end. ([#578](https://github.com/freegantt/freegantt/issues/578))

### Added

- `createGridColumnHelper(dataset)` types a column renderer's `fieldValue` from the column's key. `columnHelper.column('start', { columnRenderer: ({ fieldValue }) => … })` reads `fieldValue` as `Instant | undefined`, with no cast and no annotation. The helper is optional: it returns the plain column object, and a plain column object still reads `fieldValue` as `unknown`. `ColumnRendererContext<TValue>` and `ColumnRenderer<TValue>` take the value type, and both default to `unknown`. See `docs/12-grid-columns.md`. ([#522](https://github.com/freegantt/freegantt/issues/522))

- `EntryDelta<TProps>`, the shape `dataset.entries.syncChanges()` takes: `{ upsert, remove }`. An `upsert` row adds an entry for an unknown id and edits a known one. A key the row leaves out keeps its value. `remove` lists ids to remove, and an unknown id is ignored. ([#527](https://github.com/freegantt/freegantt/issues/527))
- `DuplicateEntryIdError`'s `kind` gains `'upsert-and-remove'`: an id named in both `EntryDelta.upsert` and `EntryDelta.remove` throws instead of silently picking a winner. ([#527](https://github.com/freegantt/freegantt/issues/527))
- `dataset.entries.syncChanges(delta)`, which applies a server delta with the same ingest rules as `syncAll`. ([#527](https://github.com/freegantt/freegantt/issues/527))
- A "Sync changes from server" button on the editing-and-data harness page, beside "Sync all from server". It calls `dataset.entries.syncChanges(server.fetchChanges())` against a scripted delta. ([#527](https://github.com/freegantt/freegantt/issues/527))
- `formatDateTime` and `formatInclusiveDate`, the two shipped date formatters, and `lastCoveredInstant`, the instant `formatInclusiveDate` builds on: `end` stepped back one millisecond, unchanged on a zero-length span. See `docs/05-consumer-api.md`. ([#577](https://github.com/freegantt/freegantt/issues/577))
- `gantt.formatFieldValue(entry, key)`, the text a Field shows for one Entry, outside the grid — a status line, a CSV row, a tooltip. Reads the same door a grid cell and a bar label read through, and follows `gantt.locale` live. Throws `UnknownFieldError` for a key no Field declares. ([#576](https://github.com/freegantt/freegantt/issues/576))
- `dateFormatter(options)`, a factory that builds a Formatter for one frozen `Intl.DateTimeFormatOptions` set. `formatDate` and `formatDateTime` are both built on it. See `docs/05-consumer-api.md`. ([#576](https://github.com/freegantt/freegantt/issues/576))
- `formatStartAndEnd(pair, ctx)`, a Formatter that reads a start and an end as one line, date only; `joinStartAndEnd(startText, endText, separator?)`, which joins two texts a caller already read through each side's own Field `formatValue`. Both keep a missing side's dash and show two equal texts once. See `docs/05-consumer-api.md`. ([#578](https://github.com/freegantt/freegantt/issues/578))
- `RollUpContext.values(key)` types a Field's values from its key. ([#428](https://github.com/freegantt/freegantt/issues/428))
- `spansTime` is exported. A `duration` Field's `compute` reads a row's own `start` and `end`, and `spansTime` checks both are set. ([#428](https://github.com/freegantt/freegantt/issues/428))

### Fixed

- A date-only `end` on a DST transition day (`2026-09-06` in `America/Santiago`) now resolves to the correct next-day instant. The old rule stepped a plain calendar day, which could land on the wrong wall-clock time across the transition. ([#577](https://github.com/freegantt/freegantt/issues/577))
