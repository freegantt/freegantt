# Brief S7.7b: a new Dependency moves its successor in the same step

Read `common-rules.md`, `wave-2-rules.md` and `wave-3-rules.md` first. Slice name: `s7-7b-reschedule-on-add`. Port: 5313.

## Why

S7.10 found the gap: `entryDependencies().add()` and the connect drag write only the dependency plugin store. The edit extender runs only for Entry edits, so `scheduling()` never sees the new link. The successor stays put until the user edits a date. The owner ruled (D17): the successor moves in the same ChangeSet, and one undo removes the link and the move.

## Change

1. **Core, generic:** the edit extension hook (`src/data/edit-extension.ts`, `src/data/transaction.ts`, `src/data/build-commit-change-set.ts`) also runs for a transaction that writes only plugin store rows. The `EditRequest` tells the extender which stores the transaction wrote (for example a read-only set of `PluginStoreName`), and the extender can read the pending rows of that store as they will be after commit. Name it with the naming skill; read `docs/agents/api.md` first. No Dependency word in `data/` or `model/`: it is a store-write signal, not a scheduling feature. Own commit, `CHANGELOG.md` line, API report.
2. **Pure tests** for the core change: a store-only transaction calls the extender once; the extender's Entry edits land in the same ChangeSet; one undo reverts both the rows and the edits; a transaction that writes nothing calls nothing; a preview frame still allocates nothing new.
3. **Plugin use:** `scheduling()` reads the pending Dependency rows when the dependency store was written, and reschedules the successors of the added or changed links with its normal rules (`successorMoves: 'pushOnly'`, manually scheduled Entries stay, constraints apply). A removed link moves nothing (push only). Own commit.
4. **Plugin tests:** `add()` of a finish-to-start link pushes a successor that starts too early; one `undo()` restores both; `replaceAll()` takes no undo step and still reschedules (README decision 5 — check it, and `ask` if it clashes); a manually scheduled successor stays.
5. **E2e** on the "Dependencies" harness page: a connect drag onto a bar that starts too early moves that bar; Ctrl+Z puts back the bar and removes the line.
6. Float and critical refresh after the move (S7.10 refresh); check one test still passes.

## Constraints

- Do not touch `src/layout/connectors/`, `src/interaction/connect.ts`, `src/render/dom/connect-affordance.ts` (S7.3c), or `src/extensions/features/entry-dependencies-selection.ts` (S7.4b).
- Invariant I4 and ADR 0042 hold: the extender never moves a proposed field unless it marks the override.
- No harness workaround. If core does not give you what you need, `ask`.
