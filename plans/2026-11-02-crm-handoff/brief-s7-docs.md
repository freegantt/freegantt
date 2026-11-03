# Brief S7 docs: consumer and plugin docs for the 0.2.0 release

Read `common-rules.md`, `wave-2-rules.md` and `wave-3-rules.md` first. Slice name: `s7-docs`. Port: 5316. Load the `editing-docs` skill before you touch `docs/`. Write in ASD-STE100 Simplified Technical English (CLAUDE.md). Never cite a spec label (D-, J-, Q- labels) outside `plans/`.

## Why

The owner wants a 0.2.0 release. Since 0.1.0, the branch added Dependencies, connectors, the connect gesture, scheduling, calendars, constraints, float and critical path. `docs/` has almost none of it. The coordinator writes `CHANGELOG.md` and bumps the version. Do not touch `CHANGELOG.md`, `package.json` or `README.md`.

## Source of truth

`CHANGELOG.md` `[Unreleased]`, `etc/freegantt.api.md`, the TSDoc in `src/api/`, `src/extensions/features/entry-dependencies*.ts`, `src/extensions/features/scheduling*.ts`, the harness pages `harness/dependencies.ts`, `harness/scheduling.ts`, `harness/critical-path.ts`, `harness/related-to.ts`, and ADRs 0040–0042. Check each claim against the code. Every code sample must typecheck: `pnpm check-doc-examples` runs in the gate.

## Change (one commit each)

1. **New guide `docs/13-dependencies-and-scheduling.md`** for a consumer: install `entryDependencies()` then `scheduling()`; add, remove and replace Dependencies; the four types and lag; the connect drag (port, drop on a bar body snaps to the nearer edge, `beforeConnect`/`connect`); select and delete a line; labels; `successorMoves`, `editedDate`, `manuallyScheduled`; constraints and `setConstraint`; working calendars; float, critical and `drivingPath`; `scheduleDiagnostics`; undo behaviour (a new link and its move are one step; `replaceAll` takes no undo step). Short samples, from the harness where you can.
2. **Connector options** in `docs/05-consumer-api.md`: `connectorRouting` (`avoidBars`, `maxAvoidRows`, default on and 200), `connectorArrow`, `fitDatasetPaddingPx`, with a link to the new guide.
3. **Plugin authoring** in `docs/06-plugin-authoring.md`: `ctx.view.registerConnector` (a provider states two ends, core routes), `ctx.view.refreshConnectors()` for screen-only state, `ctx.view.onConnect`, `ctx.view.dom.connectorFor`, `TargetKind 'connector'`, a key handler that returns `false`, `ctx.edits.writeRowsWithEdit`, `EditRequest.changedStoreRows`, `overridingProposed`, `PluginStore.syncAll`, and row-span decorations. Update `docs/edit-extension-flow.md` for store-only transactions.
4. **Styling** in `docs/10-styling-and-theming.md`: check that every new token and class is in the tables (ports, connect target, arrow, selected connector). The theming guard checks this; run it.
5. Run `pnpm docs:build` once if the network allows; if it cannot clone, say so in `worker_done`. Note in `worker_done`: the new guide needs a `guidesSidebar` entry in freegantt/docs. Do not open that pull request.

## Constraints

- Docs only, plus doc-example fixtures if the example checker needs them. No `src/` change. If a doc shows an API gap, `ask`.
