# Brief S7.12b: the scheduling plugin keeps constraint floors and drag overrules local

Read `common-rules.md`, `wave-2-rules.md` and `wave-3-rules.md` first. Slice name: `s7-12b-plugin-flags`. Port: 5342. This blocks the 0.2.0 release.

Source: `review-0-2-0.md`, blockers B2 and B3, and findings O5, O6, O7. Read those rows first.

## Change

1. **B2, failing test first.** `setConstraint('a', SNET d3)` on chain a→b→c leaves no "start no earlier than" floor on b or c. Clear a's constraint and drag a back: b and c follow back under pushAndPull.
2. **B2 fix** in `src/extensions/features/scheduling.ts` `setConstraint` (near line 608). The commit-time row writer and extender must see that the write comes from a constraint. Do not rely on a flag that is false again at commit. Prefer passing the fact with the change set (an origin or meta value) over a module flag.
3. **B3, failing test first.** Plan x→y with y placed 5 days late on purpose, plus p→q. Drag q before p ends. q lands at p's end, and y stays at d6.
4. **B3 fix** in `place()` (near lines 283–301). An overruled drag with no other proposal must not turn into a full recompute. Recompute only from the overruled Entry.
5. **O7:** `queuePushAfterSync` coalesces. N sync change sets in one turn give one `schedule()` run.
6. **O5, O6:** measure first (a drag preview frame on the 1,000-row scale page). Fix only if the change is small: skip `calculateFloat()` on preview frames, and skip the audit for the plugin's own `float`/`critical` sync write. Otherwise record the numbers in your progress file and leave them.
7. `CHANGELOG.md` lines under `### Fixed` in `[0.2.0]` (not yet published).

## Constraints

- Do not touch `src/scheduling/schedule.ts` or `src/scheduling/propagate.ts` (S7.12a works there) or `src/render/`.
- Atomic commits: one per fix, each with its test.
