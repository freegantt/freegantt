# Changelog

This file records every change a consumer of FreeGantt can see. The newest release is at the top.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). FreeGantt has not shipped yet, so a breaking change does not change the major version before 1.0.

## [Unreleased]

### Changed

- **Breaking:** `dataset.entries.sync(rows)` is now `dataset.entries.syncAll(rows)`. The behavior does not change. The new name pairs with `syncChanges`: `syncAll` takes every row, and `syncChanges` takes only the rows that changed. ([#527](https://github.com/freegantt/freegantt/issues/527))
- `dataset.entries.add()`, `load()`, `syncAll()`, `EntryDelta.upsert`, and the `Dataset` constructor's `entries` option now also take a plain `EntryInput<TProps>` row, not only `FlatEntryInput<TProps>`. A function generic over `TProps` can now pass an `EntryInput<TProps>` value straight through, with no cast. ([#527](https://github.com/freegantt/freegantt/issues/527))
- The ingest warning for a flat key that no Field declares now says that the value drops. It also names both fixes: declare the key in `fields`, or nest it as `props: { key }`. ([#524](https://github.com/freegantt/freegantt/issues/524))

### Added

- `EntryDelta<TProps>`, the shape `dataset.entries.syncChanges()` takes: `{ upsert, remove }`. An `upsert` row adds an entry for an unknown id and edits a known one. A key the row leaves out keeps its value. `remove` lists ids to remove, and an unknown id is ignored. ([#527](https://github.com/freegantt/freegantt/issues/527))
- `DuplicateEntryIdError`'s `kind` gains `'upsert-and-remove'`: an id named in both `EntryDelta.upsert` and `EntryDelta.remove` throws instead of silently picking a winner. ([#527](https://github.com/freegantt/freegantt/issues/527))
- `dataset.entries.syncChanges(delta)`, which applies a server delta with the same ingest rules as `syncAll`. ([#527](https://github.com/freegantt/freegantt/issues/527))
- A "Sync changes from server" button on the editing-and-data harness page, beside "Sync all from server". It calls `dataset.entries.syncChanges(server.fetchChanges())` against a scripted delta. ([#527](https://github.com/freegantt/freegantt/issues/527))
