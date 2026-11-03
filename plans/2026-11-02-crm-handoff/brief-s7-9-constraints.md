# Brief S7.9: constraints

Read `common-rules.md`, `wave-2-rules.md` and `wave-3-rules.md` first. Slice name: `s7-9-constraints`. Port: 5309.

## Target

Read the S7.9 section of `plans/s7-dependencies-and-scheduling/README.md`, `research-scheduling-behaviour.md` (Q4, Q6), `decisions.md` (D4, D12, F1-a), the engine's existing `startNoEarlierThan` constraint and `scheduling().constraintOf` / `clearConstraint`.

## Change

1. Add two constraint kinds beside start-no-earlier-than: **finish no later than** and **must start on**. Name them with the `naming` skill, as members of the existing constraint type.
2. Rules, from the research (Project, P6 and Syncify agree):
   - Start no earlier than: a floor. A Dependency still wins (the date moves later).
   - Finish no later than: a ceiling the engine never moves an Entry to meet. When a Dependency pushes the finish past it, the Dependency wins and a diagnostic names the constraint.
   - Must start on: a hard date. It wins over a Dependency. A broken Dependency gives a diagnostic.
   - Precedence: manually scheduled > must start on > Dependency > start no earlier than.
3. **F1-a closes here:** a start-no-earlier-than floor applies to an Entry with no incoming Dependency too. A floor later than the start moves the Entry later.
4. `scheduling().setConstraint(entryId, constraint)` on the plugin object, beside `constraintOf` and `clearConstraint`. One undo step.
5. Golden fixtures for each rule and for precedence. Diagnostics name the constraint and the Entry.
6. **Harness:** on the "Scheduling" page, add a constraint control (a small form or buttons) that sets each kind on a chosen Entry. A violated finish-no-later-than shows its diagnostic. E2e.
7. `CHANGELOG.md` lines, API report.

## Constraints

- `scheduling/` imports `time/` and `model/` only. Worklist, no recursion. 5,000-chain test stays green.
- S7.10 works in parallel on float and the critical path in `src/scheduling/` and `scheduling.ts`. Keep your changes inside propagation and constraint code; add, do not reorganize, shared types. Expect the coordinator to merge.
