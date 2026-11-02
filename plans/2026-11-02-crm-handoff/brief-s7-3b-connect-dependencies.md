# Brief S7.3b: a connect drag creates a Dependency

Read `common-rules.md`, `wave-2-rules.md` and `wave-3-rules.md` first. Slice name: `s7-3b-connect-dependencies`. Port: 5306.

## Target

The core connect gesture (`ctx.view.onConnect`, PR #675) and `entryDependencies()` (PR #674) are both on your base. Read `src/extensions/features/entry-dependencies.ts`, the connect gesture in `src/interaction/`, `harness/plugins/related-to.ts`, ADR 0041 and `decisions.md`.

## Change

1. `entryDependencies()` registers a connect handler in its `view` half. It maps the two ends to a type: end→start FS, start→start SS, end→end FF, start→end SF. Lag 0 days. It writes the row with `add` (one undo step). A drag from an Entry to itself does nothing.
2. A plugin option turns the handler off (name it with the `naming` skill), for an app that only shows Dependencies.
3. A Dependency that already exists with the same ends and type is not added twice.
4. **Harness:** the "Dependencies" page lets a user drag from a port to create each of the four types. Undo removes it. E2e for one FS and one SS create, plus undo.
5. `CHANGELOG.md` line, API report.

## Constraints

- Do not touch `src/extensions/features/scheduling*` (S7.7 is building it in parallel).
- `extensions/` imports `api/` and `model/` only. If a seam is missing, `ask`.
