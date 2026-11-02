# Brief S7.4: select, delete and label a connector

Read `common-rules.md`, `wave-2-rules.md` and `wave-3-rules.md` first. Slice name: `s7-4-connector-select`. Port: 5308.

## Target

Read the S7.4 section of `plans/s7-dependencies-and-scheduling/README.md`, ADR 0040, ADR 0041, `decisions.md` (8a, 11), `src/extensions/features/entry-dependencies.ts` and the connector render code in `src/render/dom/`.

## Change

1. `entryDependencies()` owns connector selection (README decision 8). `render/` already stamps `data-connector-id`. The plugin listens through `ctx.view.onDomEvent` and adds a `selected` flag to the selected connector (ADR 0040: flags only). Add `selected` to the connector flag keys if it is not there, with a style hook.
2. Click selects. Click on empty space clears. The Entry Selection does not change (ADR 0025: the Selection holds Entries only).
3. Keyboard: a connector is focusable; arrows move the connector selection; `Delete` removes the selected Dependency. Register keys through `ctx.interaction.registerKeyHandler`.
4. `beforeDependencyRemove` (async veto, like the core async-veto events) and `dependencyRemove`, as plugin events (decision 8a). A remove from the keyboard goes through them. One undo restores the Dependency.
5. Label (decision 11): option `labelField` (default `name`) builds "<from> → <to>". It is always the accessible name. It is drawn as text only when `showLabels: true`. If `render/` has no way to draw connector text, `ask` (Stop rule) before you add one.
6. **Harness:** on the "Dependencies" page, select a connector by click and by key, delete it, undo. The label reads in the accessibility tree. An axe check on the page.
7. `CHANGELOG.md` lines, API report.

## Constraints

- Do not touch `src/scheduling/` or `src/extensions/features/scheduling*` (S7.8 works there in parallel).
- `extensions/` imports `api/` and `model/` only. If a door is missing, `ask`.
