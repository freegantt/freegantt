# Brief S7.10: float, critical path and driving path

Read `common-rules.md`, `wave-2-rules.md` and `wave-3-rules.md` first. Slice name: `s7-10-float-critical`. Port: 5310.

## Target

Read the S7.10 section of `plans/s7-dependencies-and-scheduling/README.md` (README decision 15), ADR 0018 (EntryVariant rules), `plans/01-domain-architecture.md` §7 (`analyses`), the engine in `src/scheduling/` and `scheduling()`.

## Change

1. A pure analysis in `src/scheduling/` (a new file): a forward and a backward pass over the Dependency graph. It gives each Entry its total float. The project finish is the latest finish of all scheduled Entries. Use the request's calendar when there is one (workdays), else 24-hour days. Worklist, no recursion. A cycle skips its members and they get no float.
2. Critical: total float ≤ 0.
3. `scheduling()` declares two Fields, `float` (number of days) and `critical` (boolean), and writes them in the same transaction as each schedule run, so undo restores them. Core paints nothing (decision 15). Name the Fields with the `naming` skill; check `CONTEXT.md` first and add glossary entries for Float, Critical and Driving path.
4. `scheduling().drivingPath(entryId)`: the Entry ids, in order, of the chain of predecessors that sets this Entry's start (the predecessor with zero free float at each step).
5. Tests: textbook network fixtures with known float values, a calendar case, a cycle case, the 5,000-chain (no recursion depth failure).
6. **Harness:** a "Critical path" page. An `EntryVariant` rule styles critical bars (ADR 0018). A "Log driving path" button prints the path of the selected Entry on the page. E2e.
7. `CHANGELOG.md` lines, API report.

## Constraints

- `scheduling/` imports `time/` and `model/` only.
- S7.9 works in parallel on constraints in `src/scheduling/` and `scheduling.ts`. Put the analysis in its own files; add, do not reorganize, shared types. Expect the coordinator to merge.
- If float with constraints needs a rule the brief lacks, use plain CPM (constraints ignored in the backward pass) and say so in `worker_done`.
