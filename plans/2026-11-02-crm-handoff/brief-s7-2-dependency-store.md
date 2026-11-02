# Brief S7.2: the Dependency store

Read `common-rules.md`, `wave-2-rules.md` and `wave-3-rules.md` first. Slice name: `s7-2-dependency-store`. Port: 5303.

## Target

Read the S7.2 section of `plans/s7-dependencies-and-scheduling/README.md`, `plans/03-slices.md` § S7, `plans/01-domain-architecture.md` §6 (plugin stores), ADR 0002, ADR 0040, and `decisions.md`.

## Change

1. `entryDependencies()`, a first-party plugin in `src/extensions/features/`. It reserves a plugin store. Each row holds the predecessors of one Entry (README decision 4). Plugin id `freegantt.entryDependencies`.
2. The plugin object publishes the host API (decision 5): `replaceAll`, `add`, `remove`, and a read (`all` or `forEntry`; name it with the `naming` skill). Row shape `{ id, fromId, toId, type: 'FS' | 'SS' | 'FF' | 'SF', lag }`. Lag is in days only (ruling D5); a lag in another unit throws a typed error at the host API. Negative lag is legal. `fromId`/`toId` are `EntryId` (ruling D9).
3. Each write is one Dataset transaction, so undo restores it. `replaceAll` with an unknown Entry id throws and writes nothing.
4. A removal extender: removing an Entry removes every Dependency that names it, in the same changeset. Undo restores both.
5. A connector provider (`ctx.view.registerConnector`) that turns rows into `ConnectorInput`s. FS: end → start, SS: start → start, FF: end → end, SF: start → end. Label: "<from name> → <to name>" as the accessible name.
6. Export through `src/api/index.ts` (ruling 12b). Tree-shakes away when unused.
7. **Harness:** a "Dependencies" page with a dependency fixture (all four types, one negative lag). A "Replace dependencies" button swaps the whole set; scroll, zoom and collapsed groups survive. The page is the plugin's documentation: write it as a consumer would. E2e for draw and replace.
8. `CHANGELOG.md` lines.

## Constraints

- `extensions/` imports `api/` and `model/` only (`extensions-public-only`). If you need a door the public API does not have, `ask`.
- No connect gesture (S7.3 builds the core controller in parallel), no selection or delete UI (S7.4), no `scheduling()` (S7.7). The plugin works with no `scheduling()` installed.
- **Not installed:** no store, no connectors. Prove it with a test.

## Observable acceptance

- Tests: removal cascade with undo, replace-all atomic failure, lag unit error, not-installed, connector mapping for all four types.
- The harness page and its e2e.
