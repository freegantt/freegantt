# Brief S7.7: the scheduling() plugin

Read `common-rules.md`, `wave-2-rules.md` and `wave-3-rules.md` first. Slice name: `s7-7-scheduling-plugin`. Port: 5305.

## Target

Read the S7.7 section of `plans/s7-dependencies-and-scheduling/README.md`, `plans/01-domain-architecture.md` §7, ADR 0002, ADR 0008, and all of `decisions.md` (D3–D7a, C1–C5, F1-a). The engine (`src/scheduling/`, `schedule()`) and `entryDependencies()` (`src/extensions/features/entry-dependencies.ts`) are on your base. Read both first.

## Change

1. `scheduling(options?)`, a first-party plugin in `src/extensions/features/`. `requires: ['freegantt.entryDependencies']`. `entryDependencies()` never learns about it.
2. Occupy the edit hook (`ctx.edits.setExtender`). Build the `schedule()` request from the proposed edit, the Dependency rows (read-only store read), the manually scheduled Entries and the constraints. Merge the engine's writes into the same transaction, so one undo restores every Entry (I7).
3. **Manually scheduled (ruling D6, C5).** The plugin declares a boolean Field `manuallyScheduled` (plugin-declared Field, not a core key), so a consumer binds a grid toggle column to it with no glue. The engine never moves such an Entry; a broken Dependency gives a diagnostic.
4. **A user date on a scheduled Entry (ruling D4).** The proposed start becomes a "start no earlier than" constraint, stored in the plugin's own store (one row per Entry). The engine then places the Entry: the Dependency wins over the floor. Do not let the engine overwrite a field that stays in `proposed` (I4 dev assert): turn the proposal into the constraint first. Option (name it with the `naming` skill) for "the user's date always wins": the proposal stays proposed, and a diagnostic marks the broken link. Default is the floor behavior.
5. **Options:** `successorMoves` (default push and pull, ruling D3b), the D4 option above. No calendar option yet (S7.8). With no calendar, days are 24 hours.
6. **Host API** on the plugin object, like `entryDependencies()`: read and clear an Entry's constraint, and read the last diagnostics. Name each call with the `naming` skill.
7. **Diagnostics:** a `scheduleDiagnostics` event (plugin event, not core). A connector provider that adds `{ cycle: true }` to the connectors of cycle members (ADR 0040: same id, flags only).
8. **Harness:** a "Scheduling" page with a fixture chain (FS, SS, FF, SF, one negative lag), a `manuallyScheduled` toggle column, and a cycle fixture whose members are listed on the page from the diagnostics. Drag a predecessor later: successors move. Drag it earlier: successors follow (pull). Undo restores all. No ghost drawing (the handoff rules it out). E2e for each.
9. `CHANGELOG.md` lines and the API report.

## Constraints

- `extensions/` imports `api/` and `model/` only. If the engine or a seam lacks something, `ask` (Stop rule).
- **Not installed:** connectors draw, nothing moves, no `manuallyScheduled` Field. Prove it with a test.
- If item 4 needs a choice the rulings do not cover (for example how a proposed end becomes a constraint), `ask`.

## Observable acceptance

- Tests: cascade with undo (I7), pull earlier, push only, floor vs link, manually scheduled conflict, cycle flags, not-installed.
- The harness page and its e2e.
