# Brief S7.4b: a plugin asks core to redraw connectors

Read `common-rules.md`, `wave-2-rules.md` and `wave-3-rules.md` first. Slice name: `s7-4b-refresh-connectors`. Port: 5312.

## Why

S7.4 (#679) shipped connector selection. `select()` in `src/extensions/features/entry-dependencies-selection.ts` stores the id but nothing repaints, so the `selected` flag and `aria-current` show only after an unrelated redraw. The owner picked a generic door (ruling D16). ADR 0040 is amended: read its "Amended 2026-11-02" line.

## Change

1. **Core door:** add `ctx.view.refreshConnectors(): void` to the plugin view context. It asks every `ConnectorProvider` again and redraws the connectors. Several calls before the next frame give one redraw. It writes nothing to the Dataset, makes no undo step and fires no change event. Put the reason in its TSDoc: screen-only provider state, such as a selection. Data still belongs in a plugin store. Own commit, with `CHANGELOG.md` line and the API report (`pnpm -s build && pnpm exec api-extractor run --local`).
2. **Pure test** for the door: a provider whose answer changes, then `refreshConnectors()`, gives the new flags in the connector layout; two calls in one frame give one layout pass.
3. **Plugin use:** `connectorSelection` calls `ctx.view.refreshConnectors()` when the selected id changes (and only then). Own commit.
4. **E2e** on the "Dependencies" harness page: a click on a connector shows the selected style and `aria-current` at once; a click on empty chart clears both. Keyboard focus by arrow keys moves the selected style.
5. Update every view-context test stub that the new member breaks (`scheduling.test.ts` has one).

## Constraints

- Do not touch `src/layout/connectors/route-connector.ts` (router under research), `src/interaction/connect.ts`, `src/render/dom/connect-affordance.ts` (S7.3c owns them), or `src/data/` (S7.7b owns the extension hook).
- No harness workaround. If core does not give you what you need, `ask`.
