# S3 implementation handoff

Status as of 2026-08-30, end of a session that implemented **S3.1** and **S3.2**. Next session: read [`README.md`](./README.md) (tracker + gotchas), then open **[`s3.3-drag-move.md`](./s3.3-drag-move.md)** and continue there.

## What landed (commit `9ce93ad` on `s3-impl`)

See [`s3.1-selection.md`](./s3.1-selection.md) and [`s3.2-hot-path-and-capabilities.md`](./s3.2-hot-path-and-capabilities.md) for full checklists — both marked done except harness-visible group demo (deferred; covered by `dom` tests).

Summary:

- **P3 + API→INT** — `INT --> MODEL`, `API --> INT`; `GanttShell` takes `attachEntryGestures` by injection from `api/gantt.ts`.
- **S3.1** — `Gantt.selection`, selection events, `applyState` selected token, pointer select in `entry-gestures.ts`, harness readout.
- **S3.2** — `view/capability.ts`, `Gantt.interactions`, hover/handles/`data-movable`, `[S3-A3]`/`[S3-A5]` pointer half.

Full suite green at last check. `.slice` still `S1.13` until S3.8.

## What's next

**S3.3 — drag-move** ([`s3.3-drag-move.md`](./s3.3-drag-move.md)):

- `time/snapInstant`, `layout/gesture-draft.ts`, `EntryEdits` → `model/`
- `attachPointerGesture`, full `EntryGestureContext`
- `beforeEntryMove` → transaction → `entryMove`
- Grow `entry-gestures.ts` in place (do not replace)

Then S3.4–S3.8 in order per [`README.md`](./README.md) step map.

## Gotchas

1. **Don't let `view/` import `interaction/`.** Use constructor injection on `GanttShell`.
2. **`EntrySelectionContext` → `EntryGestureContext`** in S3.3 — incremental growth, not a rewrite.
3. **`InteractionState` fields** — add as each step needs them; full shape in D-S3-6 across step files.
4. **Pre-commit hook** auto-formats; `protect-spec.sh` may block small `.dependency-cruiser.cjs` edits — use full-file `Write` if needed.
5. **Run all five checks** before marking a step done (vitest, tsc, eslint, depcruise, guard-red-test).
6. **Write a fresh handoff** before context runs low.
