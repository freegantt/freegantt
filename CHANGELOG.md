# Changelog

This file records every change a consumer of FreeGantt can see. The newest release is at the top.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). FreeGantt has not shipped yet, so a breaking change does not change the major version before 1.0.

## [Unreleased]

### Changed

- **Breaking:** `dataset.entries.sync(rows)` is now `dataset.entries.syncAll(rows)`. The behavior does not change. The new name pairs with `syncChanges`: `syncAll` takes every row, and `syncChanges` takes only the rows that changed. ([#527](https://github.com/freegantt/freegantt/issues/527))

### Added

- `EntryDelta<TProps>`, the shape `dataset.entries.syncChanges()` takes: `{ upsert, remove }`. An `upsert` row adds an entry for an unknown id and edits a known one. A key the row leaves out keeps its value. `remove` lists ids to remove, and an unknown id is ignored. ([#527](https://github.com/freegantt/freegantt/issues/527))
