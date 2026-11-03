# Brief P: apply the owner's rulings to the S7 plan, and draft two ADRs

Read `common-rules.md` and `wave-2-rules.md` (same folder) first. Slice name for your progress file: `p-plan-and-adrs`.

You work in the existing worktree for PR #667 (branch `Pawel-IT/s7-link-seam-design`). Pull first.

**Planning only. No `src/` or `harness/` changes.**

## Change

1. **Update `plans/s7-dependencies-and-scheduling/README.md`** to match `decisions.md`:
   - Status: decided. Add a short "Rulings" section that points at each decision.
   - Rename everywhere: link → connector, `LinkSpec` → `ConnectorInput`, `registerLinkSource` → `registerConnector`, `FrameLink` → `FrameConnector`, `links` → `connectors`, `LinkFlags` → `ConnectorFlags`, `{ from, fromEdge }` → `from: { entryId, edge }`. The link-create gesture → the connect gesture: `Connect` controller, `'connect'` capability, `beforeConnect` / `connect`, `ctx.view.onConnect`, connector ports.
   - `beforeLinkRemove` → `beforeDependencyRemove`, a plugin event.
   - S7.5: the Working calendar lives in the scheduling plugin, not `time/`. `calendar.offTime()` returns a `TimeCover`-shaped object. It is optional everywhere. Exports go through `api/index.ts`.
   - Remove `WorkCalendar`; the name is `WorkingCalendar`.
2. **Draft two ADRs** in `docs/adr/`, numbered after 0039 (read `docs/adr/README.md` for the format and status words). Status: **Proposed**. The owner accepts them, not you.
   - "A plugin states a connector's two ends, and core routes it": the seam ruling (decisions 1, 1a, 2, 3), with options 1, 2 and 4 as rejected alternatives.
   - "Core owns the connect gesture, and a plugin owns its meaning": decisions 6 and 7.
   - Add both to the ADR index if one exists.
3. **Update `CONTEXT.md`** (`domain-modeling` skill):
   - New entries: **Connector**, **ConnectorInput**, **Connect gesture**.
   - **Dependency**: change its *Avoid* note so "Link" points to Connector. Replace "link-create gesture" and "dependency-arrow rendering" in the `entryDependencies()` entry.
   - **Working calendar**: still reserved in the scheduling plugin's domain. Add the three questions it answers and that it is optional.
   - The `data-flag` text (about link tokens) and `GeometryFrame` text: use connector words.
   - Keep the **Attachment** *Avoid* note on "connector". It now protects the new term.
4. **Update `plans/03-slices.md` § S7** with the gaps in README §6 that the rulings close: the slice list, the stale `#136` seam line, "not installed" acceptance rows for both plugins, the connector-drawing perf row. Keep the waiver sentence worker G added (it is on `main` only after PR #666 merges; if it is not on your branch, do not add it again).
5. Update `plans/01-domain-architecture.md` §4's stale links text to connector words.

## Constraints

- Simplified Technical English. No spec labels outside `plans/`.
- Do not change a ruling. If a ruling looks wrong, `ask`.

## Observable acceptance

- PR #667 holds the updated README, the two Proposed ADRs, the glossary and the plan edits.
- `pnpm verify` passes (docs lint, links).
- `worker_done` lists the two ADR file names.
