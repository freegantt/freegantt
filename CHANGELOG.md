# Changelog

This file records every change a consumer of FreeGantt can see. The newest release is at the top.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). FreeGantt has not shipped yet, so a breaking change does not change the major version before 1.0.

## [Unreleased]

### Changed

- `parentId` is now `editable: 'anywhere'`. A vertical drag may re-parent an Entry; the grid cell still shows no editor for it, because `entryId` ships no `parseValue`. ([#425](https://github.com/freegantt/freegantt/issues/425))

### Added

- A vertical drag on a bar moves its Entry to another row: before a row, after a row, or into a row as a child. The drag picks a time axis or a row axis after 4 px of travel and holds it for the whole gesture. A tree row splits into three drop zones, an insertion line marks where the bar lands, a refused drop paints `data-drop="refused"` with a `not-allowed` cursor and commits nothing, and one drop is one transaction that one undo reverses. ([#425](https://github.com/freegantt/freegantt/issues/425))
- New capability `reorder`. `gantt.setCapabilityRule('reorder', false)` turns off vertical drag for every row. ([#425](https://github.com/freegantt/freegantt/issues/425))
- `entryMove` and `beforeEntryMove` carry `place` and `currentPlace` (a new `TreePlace` type) when a drag changes the tree, and `shiftsTime` when a drag changes the dates. A handler tells a vertical move from a horizontal one. **Breaking:** `EntryMove` is now a discriminated union on `shiftsTime` — `start`/`end` are `Instant` only when `shiftsTime` is `true`; a handler narrows on it before reading either. This lets a tree-only move report an undated Entry, for #602's grid row drag. ([#425](https://github.com/freegantt/freegantt/issues/425), [#602](https://github.com/freegantt/freegantt/issues/602))
- New report code `rollup-preview-failed`: a plugin aggregator threw while a drag previewed the new parent's Rollup dates. The frame paints with no Rollup ghost, and the drag goes on. ([#425](https://github.com/freegantt/freegantt/issues/425))
- The hierarchy-and-timeline harness page's phase-plugin tree is now opt-in (`?tree=phase`); by default the page drags like the generic page. The generic harness page gains a "Lock tree" checkbox. ([#425](https://github.com/freegantt/freegantt/issues/425))
- A drag on a grid row moves its Entry before, after or into another row, with the same drop zones, Insertion line and refusal as a vertical bar drag. `reorder: false` turns off both. ([#602](https://github.com/freegantt/freegantt/issues/602))

## [0.0.1] - 2026-09-28

The first release on npm: `npm install freegantt`.

### Changed

- **Breaking:** The default date editor opens on a date that has a time of day. It no longer refuses it, and the `time-of-day` report code is removed. When the user commits the same day, the stored time of day stays. A new day stores the start of that day. ([#596](https://github.com/freegantt/freegantt/issues/596))
- **Breaking:** `DateInput` has a new required member, `showsTimeOfDay`. `inlineEditing()` now applies the date-only end rule to each control that reports `false`, not only to the default control. A consumer date picker on `end` opens on the last covered day, and a typed day stores the start of the next day. A control that reports `true` works as before. ([#579](https://github.com/freegantt/freegantt/issues/579))
- The default `zoomPresets` has ten steps, not nine. `quarterAndYear` sits between `monthAndYear` and `year`, so one zoom-out step no longer jumps from months to years. To keep the old steps, filter it out of `gantt.zoomPresets`. ([#101](https://github.com/freegantt/freegantt/issues/101))
- `sum`, `min` and `max` also fold `Duration` values in milliseconds, and answer a `Duration`. `docs/05` shows a computed Field that sums its children. ([#582](https://github.com/freegantt/freegantt/issues/582))
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

- The shipped `quarterAndYear` preset: a year band over a calendar quarter band. `formatQuarter` gives its `Q1`–`Q4` label in the dataset zone, for a custom preset too. ([#101](https://github.com/freegantt/freegantt/issues/101))
- `dataset.formatFieldValue(entry, key, locale?)` gives a Field's text with no Gantt, for an export or
  a server-side report. It is the text a grid cell shows, in the Dataset's zone. `locale` beats this
  Dataset's own `locale`; omit both for the runtime's own locale. `gantt.formatFieldValue(entry, key)`
  now reads through it with this Gantt's own locale first, then its Dataset's, then the runtime's own.
  ([#583](https://github.com/freegantt/freegantt/issues/583))
- `new Dataset({ locale })`, a locale a consumer names once instead of on every `formatFieldValue`
  call. `dataset.locale` reads it back. A `formatFieldValue` call's own `locale` still beats it, and
  it beats only the runtime's own. A `Gantt` with no `locale` of its own now falls back to its
  Dataset's `locale` before the runtime's, in the Grid, a bar label, the header and
  `gantt.formatFieldValue` alike. ([#583](https://github.com/freegantt/freegantt/issues/583))
- The default date editor's own consumer `dateInput` factory now also sees the Dataset's `locale`
  fallback, through `gantt.formatContext`, in place of a raw `gantt.locale` that skipped the Dataset
  when the Gantt named no locale of its own. ([#583](https://github.com/freegantt/freegantt/issues/583))
- `createGridColumnHelper(dataset)` types a column renderer's `fieldValue` from the column's key. `columnHelper.column('start', { columnRenderer: ({ fieldValue }) => … })` reads `fieldValue` as `Instant | undefined`, with no cast and no annotation. The helper is optional: it returns the plain column object, and a plain column object still reads `fieldValue` as `unknown`. `ColumnRendererContext<TValue>` and `ColumnRenderer<TValue>` take the value type, and both default to `unknown`. See `docs/12-grid-columns.md`. ([#522](https://github.com/freegantt/freegantt/issues/522))

- `EntryDelta<TProps>`, the shape `dataset.entries.syncChanges()` takes: `{ upsert, remove }`. An `upsert` row adds an entry for an unknown id and edits a known one. A key the row leaves out keeps its value. `remove` lists ids to remove, and an unknown id is ignored. ([#527](https://github.com/freegantt/freegantt/issues/527))
- `DuplicateEntryIdError`'s `kind` gains `'upsert-and-remove'`: an id named in both `EntryDelta.upsert` and `EntryDelta.remove` throws instead of silently picking a winner. ([#527](https://github.com/freegantt/freegantt/issues/527))
- `dataset.entries.syncChanges(delta)`, which applies a server delta with the same ingest rules as `syncAll`. ([#527](https://github.com/freegantt/freegantt/issues/527))
- A "Sync changes from server" button on the editing-and-data harness page, beside "Sync all from server". It calls `dataset.entries.syncChanges(server.fetchChanges())` against a scripted delta. ([#527](https://github.com/freegantt/freegantt/issues/527))
- `formatDateTime` and `formatInclusiveDate`, the two shipped date formatters, and `lastCoveredInstant`, the instant `formatInclusiveDate` builds on: `end` stepped back one millisecond, unchanged on a zero-length span. See `docs/05-consumer-api.md`. ([#577](https://github.com/freegantt/freegantt/issues/577))
- `gantt.formatFieldValue(entry, key)`, the text a Field shows for one Entry, outside the grid — a status line, a CSV row, a tooltip. Reads the same door a grid cell and a bar label read through, and follows `gantt.locale` live. Throws `UnknownFieldError` for a key no Field declares. ([#576](https://github.com/freegantt/freegantt/issues/576))
- `dateFormatter(options)`, a factory that builds a Formatter for one frozen `Intl.DateTimeFormatOptions` set. `formatDate` and `formatDateTime` are both built on it. See `docs/05-consumer-api.md`. ([#576](https://github.com/freegantt/freegantt/issues/576))
- `formatStartAndEnd(pair, ctx)`, a Formatter that reads a start and an end as one line, date only; `joinStartAndEnd(startText, endText, separator?)`, which joins two texts a caller already read through each side's own Field `formatValue`. Both keep a missing side's dash and show two equal texts once. See `docs/05-consumer-api.md`. ([#578](https://github.com/freegantt/freegantt/issues/578))
- `gantt.formatContext`, the `FormatContext` a grid cell, a bar label, and `formatFieldValue` all format through. A caller building its own Formatter call, such as `formatStartAndEnd`, reads this instead of assembling a second `{ timeZone, locale }`. Live: follows `gantt.locale`. ([#578](https://github.com/freegantt/freegantt/issues/578))
- `RollUpContext.values(key)` types a Field's values from its key. ([#428](https://github.com/freegantt/freegantt/issues/428))
- `spansTime` is exported. A `duration` Field's `compute` reads a row's own `start` and `end`, and `spansTime` checks both are set. ([#428](https://github.com/freegantt/freegantt/issues/428))

### Fixed

- A consumer `dateInput` control that shows no time of day no longer drops the time of day of a `start` or a custom date Field when the user presses Enter on an unchanged day. ([#596](https://github.com/freegantt/freegantt/issues/596))
- A date-only `end` on a DST transition day (`2026-09-06` in `America/Santiago`) now resolves to the correct next-day instant. The old rule stepped a plain calendar day, which could land on the wrong wall-clock time across the transition. ([#577](https://github.com/freegantt/freegantt/issues/577))
