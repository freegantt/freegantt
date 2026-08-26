# S1.10 — Implementation handoff

**Branch:** `peaceful-hawk` (fast-forwarded onto `s1.10-theming-and-a11y` to pick up the settled spec at `plans/s1.10-theming-and-a11y/README.md`). Nothing committed yet — everything below is unstaged working-tree state.

**Verified green at handoff time:** `pnpm typecheck`, `pnpm lint`, `pnpm test:node`, `pnpm test:dom` all pass. `pnpm boundaries`, `pnpm guards`, `pnpm vendor-names`, `pnpm build`, `pnpm test:e2e` have **not** been run this session.

---

## Done (§8 TODO order)

1. **Guardrail** — `eslint/rules/no-inline-style-outside-geometry.cjs` + `.test.cjs`, registered in `eslint/rules/index.cjs` and `eslint.config.js`, documented in `docs/02-lint-rules.md` §3.11 (+ phasing table row).
2. **`time/`** — `src/time/format.ts` (`formatDate`, `formatEndInclusive`), exported from `time/index.ts` and re-exported from `api/index.ts`. Tests in `src/time/format.test.ts` cover DST spring-forward, DST fall-back, and a month boundary.
3. **`layout/`** — `BarFlags`/`LinkFlags` renamed (`hasConflict`→`conflict`, `inCycle`→`cycle`) in `src/layout/frame.ts`; `FrameBar.a11yLabel` computed in `computeFrame` via `formatDate`/`formatEndInclusive` against `scale.timeZone`; `GeometryFrame.rowCount` added — **total** row count (`entries.length`), not the windowed `rows.length`, feeding `aria-setsize` per D-S1.10-5's "no row 3 of nothing" requirement. Snapshot (`__snapshots__/frame.test.ts.snap`) updated; new tests added for `rowCount` and `a11yLabel` composition.
4. **`view/`**:
   - `src/view/styles.ts` — new file, `ensureBaseStyles(doc)` + the full base stylesheet (structure classes absorbing pane-layout.ts's/render-dom's old inline writes, plus D-S1.10-9's 13 colour tokens in `:root`, `[data-fg-theme='dark']`, and `@media (prefers-color-scheme: dark)`). Idempotent via `<style data-freegantt-styles>` marker (D-S1.10-8). Tests in `src/view/styles.test.ts` cover idempotency (one `<style>` for two Gantts, second call is a no-op), token presence in both theme blocks, and host-set `--fg-bar-fill` overriding the shipped default.
   - `src/view/pane-layout.ts` — every non-`width`/`height` inline style write removed; picked up by stylesheet classes instead. **Deviation from the spec text, flagged for review below.**
   - `src/view/pane-layout.ts` also now sets `role="group"` + `tabindex="0"` on the host (D-S1.10-5's one honest tab stop for this step — no roving tabindex until S4).
   - `src/view/gantt-shell.ts` — live `theme`/`a11yLabel` get/set accessors (`Theme = 'auto'|'light'|'dark'`, default `'auto'`; `a11yLabel` default `'Gantt'`), both exported as new `GanttShellOptions` fields; `ensureBaseStyles(this.#host.ownerDocument)` called at construction, before `PaneLayout` builds anything (D-S1.10-8's ordering requirement, avoids a flash of unstyled content).
   - `src/view/index.ts` — exports the new `Theme` type.
5. **`render/dom`** (`src/render/dom/index.ts`):
   - `data-flag` generated from `BarFlags`' own keys via `flagTokens()` — table-driven, no hand-mapping (D-S1.10-2, closes U7).
   - Roles: `.fg-row` → `role="listitem"` + `aria-posinset`/`aria-setsize`; `.fg-bar` → `role="img"` + `aria-label` from `FrameBar.a11yLabel` — **not** the grid/row/gridcell pattern (D-S1.10-5, revised, because `.fg-row` and `.fg-bar` are DOM cousins under the split-pane architecture and can never satisfy ARIA's grid-containment requirement).
   - `.fg-row-label` child added in `create` (structural, once — not per-frame) per D-S1.10-7; `RowGeom` gained `index`/`rowCount`, `BarGeom` gained `flags`/`a11yLabel` (not `index` — no `gridcell`, so no `aria-rowindex` to derive, per D-S1.10-7's closed question).
   - `data-testid="fg-row"` + `data-row-id`, `data-testid="fg-bar"` (existing `data-item-id` kept) per U6.
   - Every `node.style.position/visibility/top/left` write deleted; picked up by `.fg-tick`/`.fg-band`/`.fg-row`/`.fg-bar`/`.fg-header`/`.fg-bars`/`.fg-content-sizer` (new class) rules in `view/styles.ts`.
   - `pixel-property.ts` untouched — not in scope for this step.
6. **`api/`** (`src/api/gantt.ts`, `src/api/index.ts`) — `Gantt.theme`/`Gantt.a11yLabel` live accessors, `GanttOptions.theme`/`.a11yLabel`, `formatDate`/`formatEndInclusive`/`Theme` re-exported from `api/index.ts`.

---

## Deviation from the spec text — needs a decision

**The spec's six pane class names (D-S1.10-1, Q2) don't cover the host element.** D-S1.10-6 says pane-layout.ts's structural inline styles move to class rules "keyed to the six `fg-*` pane class names" — but the *host's own* `display: flex; overflow: hidden` (D-S1.8-1) is also structural, and once the guardrail lint rule landed, that inline write had nowhere legal to live. There's no class or stable selector on the host in the shipped twelve-class vocabulary (Q2's list) to hang a stylesheet rule off of.

**What I did:** added a 13th class, `fg-host`, set once in `PaneLayout`'s constructor, with a matching `.fg-host { display: flex; overflow: hidden; }` rule in `view/styles.ts`.

This works and is tested, but it's outside what D-S1.10-1 explicitly enumerated as "the real vocabulary, unchanged." Options if this needs to be reconciled with the spec before merge:
- Accept `fg-host` as a documented 13th class (cheapest — just needs a decision-doc update, not a code change).
- Target the host by attribute instead (e.g. `[role="group"]` — already set on host for a11y) rather than a new class, if a 13th class name is unwanted.

Flagging this explicitly rather than silently picking one, since D-S1.10-1's "no renames" framing was written as a closed decision.

---

## Not yet done

- **Harness** — `harness/index.html`, `harness/scroll-sync.html`, `harness/zoom.html` still hand-write `.fg-header`/`.fg-band`/`.fg-tick`/`.fg-row`/`.fg-bar` background/color/border-radius rules that the base stylesheet now ships redundantly (CLAUDE.md's harness rule: review `harness/main.ts` and friends on every commit). Sizing/typography (font-size, padding, white-space, line-height, explicit heights) are still legitimately harness-owned and should stay; only the color/background/border/border-radius declarations that now duplicate `view/styles.ts` should go.
- **Docs (§7 list)** — only `docs/02-lint-rules.md` §3.11 is done. Still open:
  - `plans/01-domain-architecture.md` §4 — `GeometryFrame`/`FrameBar`/`BarFlags`/`LinkFlags` code block: `hasConflict`→`conflict`, `inCycle`→`cycle`, add `FrameBar.a11yLabel`.
  - `plans/01-domain-architecture.md` §5 — note `formatEndInclusive`/`formatDate` as shipped (`time/format.ts`), closing the S0-era promise.
  - `plans/01-domain-architecture.md` §8.1/§8.3 — paragraph noting `render/dom`'s inline writes are now geometry-only, everything else moved to the base stylesheet; the ARIA roles `mount`/`sync` write.
  - `plans/02-public-api.md` §4 — complete `--fg-*` token table (metrics + all 13 colour tokens with real defaults), `data-flag` vocabulary (`conflict`, `cycle`) as real not aspirational, `data-testid` hooks documented.
  - `docs/01-invariant-guard-matrix.md` §2 — row for the new inline-style lint rule.
  - `CONTEXT.md` — new glossary entries: **Base stylesheet**, **Token**, **Part** / **State attribute**, **a11y label** (disambiguated from `Gantt.a11yLabel` per the #7 "chart" lesson).
- **`render/dom/index.test.ts`** — not yet extended with the §6-listed cases. The backend code is done and exercised indirectly (via `gantt-shell.test.ts`/`styles.test.ts`), but direct unit coverage is missing for:
  - a bar with `flags: {conflict: true}` renders `data-flag="conflict"`
  - a hypothetical third `BarFlags` key renders with no `render/dom` change (drives the generated path)
  - `.fg-row` has one `.fg-row-label` child carrying the row's label text
  - `.fg-row`'s `aria-posinset`/`aria-setsize` correct against a windowed frame over a larger-than-window fixture
  - `.fg-bar` carries `role="img"` and its `aria-label`, not `role="gridcell"`
  - host has exactly one `tabindex="0"` element in the whole render tree
- **`eslint/rules/no-inline-style-outside-geometry.test.cjs`** exists and passes, but wasn't cross-checked against the exact red-fixture wording D-S1.10-6/§6 describes ("a snippet shaped like `pane-layout.ts`'s current display/overflow writes") — current fixture cases are close but worth a second look for fidelity.
- `pnpm boundaries`, `pnpm guards`, `pnpm vendor-names`, `pnpm build`, `pnpm test:e2e` — none run yet.
- Nothing committed.

---

## Where to pick up

1. Resolve the `fg-host` deviation (decide and note it, or change approach).
2. Extend `render/dom/index.test.ts` with the §6 cases (code already exists — this is pure test-writing).
3. Trim the harness files.
4. Sweep the §7 doc edits.
5. Run `pnpm verify` end to end and fix whatever `boundaries`/`guards`/`vendor-names`/`build`/`e2e` turn up (untested this session).
6. Tick the §1 acceptance checkboxes (U1–U7) once their tests exist and pass.
