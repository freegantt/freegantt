# S4 close-out — remaining review work

**Slice:** S4 · **Spec:** [`README.md`](./README.md) · **Findings:** [`plans/reviews/2026-09-01-s4-implement-final.html`](../reviews/2026-09-01-s4-implement-final.html)
**Branch:** `s4-implement` · **Form:** one commit per step below. Tick the step boxes in this file in the same change as the code. Do not start the next step until the current step is on origin.
**Ends with:** `pnpm verify && pnpm gate` green, this file's remaining boxes ticked, README § close-out status updated.

This is the leftover from the 2026-09-01 close-out plan after P0–P3. Do not reopen P0–P3. Do not grow the plugin surface (S5).

---

## 0. Already on origin

| Plan phase | What it closed | Commit |
|---|---|---|
| P0 | D1–D3, `parentRowId` row pipeline, forgotten-export gate | `2595587` |
| P1 | D5 undefined/null sort last; D7 unregistered sort key throws; D6 duration compare; SP3 `sort.test.ts` + `resolve-rows.test.ts` | `0def75c` |
| P2 | A2 FrameMemory owns height; A3 TreeCollapse `confirm`; D4 reveal under group/custom; A6 one veto; C15 `isDevMode`; C10 `pickDefined` | `b7621d3` |
| P3 | A4 `SOURCE_STRATEGY`; A5 Field reader on `filter` / `groupBy` / `sort.compare`; harness `teamOf` gone | `114de56` |
| P4 S1–S3 | Parts + State attrs in `CONTEXT.md`; delete `:root, .fg-container` indent/lane-gap winning rule; twisty+label in `create`, patch toggles only | `187ce7f` **local only** — pre-push failed (see CO.0) |

`SOURCE_STRATEGY` lives in `src/data/fields/source-strategy.ts`. `field-lookup.ts` is gone. Row callbacks take optional `FieldContext`. `{ key: 'team' }` is declared on the demo and hierarchy fixtures.

---

## 1. Remaining steps

Run in this order. Each step is one agent session's job. Each step ends on a checkable done line.

### CO.0 — Unblock origin (S2 leftover)

**Done when:** `187ce7f` is on origin (or a follow-up commit on top of it is); `pnpm verify` passes; `git push` succeeds.

Pre-push of `187ce7f` failed: `src/view/styles.test.ts` still asserts the sheet contains `--fg-lane-gap`. That name lived only on the deleted `:root, .fg-container` winning rule. `--fg-indent-width` still appears in `var(--fg-indent-width, 12px)`, so that assertion passed. The shell still reads `--fg-lane-gap` through `readPixelProperty` (`gantt-shell.ts`).

**Do this:** put the two Token defaults on `.fg-container` only (same block as the colour Tokens), not on `:root`. Keep the `var(…, 12px)` / `DEFAULT_LANE_GAP_PX` fallbacks. Do not restore `:root, .fg-container { … }`.

- [ ] `--fg-indent-width: 12px` and `--fg-lane-gap: 2px` on `.fg-container` in `src/view/styles.ts`
- [ ] `styles.test.ts` still finds both names; optionally assert the sheet does **not** contain `:root, .fg-container`
- [ ] `pnpm verify && pnpm gate` → commit if the Tokens were not in `187ce7f` → `git push` (this also publishes `187ce7f`)

**Files:** `src/view/styles.ts`, maybe `src/view/styles.test.ts`.

**Commit (if needed):** `Set indent and lane-gap Tokens on the container, not on :root.`

---

### CO.1 — Live `hierarchy` (plan S5)

**Done when:** `dataset.hierarchy = { autoGroup: false }` changes later commits only; the Dataset instance stays alive; `pnpm verify && pnpm gate`; commit and push.

- [ ] `DatasetState`: `#hierarchy` + `setHierarchy(value)` through `resolveHierarchy` (same shape as `setRollUpKinds`).
- [ ] `api/dataset.ts`: `set hierarchy`. Drop the "construction-time only" comment.
- [ ] Test in `src/api/dataset.test.ts`: assign `{ autoGroup: false }`, then add a first child to a `'span'` parent — Kind stays `'span'`. Assign `{ autoGroup: true }`, add a first child — parent becomes `'group'` in that transaction.
- [ ] `harness/hierarchy.ts`: keep the Dataset. `dataset.hierarchy = { autoGroup: next }`. Remove `rebuildDataset` destroy-rebuild.
- [ ] Live toggle does **not** re-promote existing span parents. That is intended.
- [ ] `pnpm exec api-extractor run --local` if `etc/freegantt.api.md` diffs. Note the additive setter in the commit.

**Files:** `src/data/dataset-state.ts`, `src/api/dataset.ts`, `src/api/dataset.test.ts`, `harness/hierarchy.ts`, maybe `etc/freegantt.api.md`.

**Commit:** `Make Dataset.hierarchy live so the harness can toggle autoGroup without remount.`

---

### CO.2 — Shared `ScrollModel` through remount (plan S4)

**Done when:** import remount reuses a consumer-held `ScrollModel`; `preservePaneScroll` is gone; `docs/05` names the call; `pnpm verify && pnpm gate`; commit and push.

- [ ] `GanttOptions.scroll` already exists and the shell already forwards it. Do not invent a second knob.
- [ ] `harness/hierarchy.ts`: `const paneScroll = new ScrollModel()`. Pass `scroll: paneScroll` on every `new Gantt(...)`.
- [ ] Delete `preservePaneScroll` (pane `querySelector` + forged `scroll` Event).
- [ ] Import still remounts (new Dataset from JSON). Reuse the same `ScrollModel`.
- [ ] Document in `docs/05-consumer-api.md`: pass the same `ScrollModel` into a new `Gantt` after destroy so scroll survives remount.

**Files:** `harness/hierarchy.ts`, `docs/05-consumer-api.md`. Review `harness/main.ts` on the commit, changed or not.

**Commit:** `Keep a consumer ScrollModel across harness remount and drop pane-scroll forging.`

---

### CO.3 — README close-out + deferred barrel

**Done when:** README matches the code; barrel prune is recorded as deferred; this file's CO.3 boxes are ticked; `pnpm verify && pnpm gate`; commit and push.

- [ ] `plans/s4-hierarchy-and-rows/README.md` §9: collapse tests are `view/tree-collapse.test.ts` (not `collapse-state.test.ts`).
- [ ] README §7 gotcha 3: Field source routes through `SOURCE_STRATEGY`, not "one switch in field-access.ts".
- [ ] README: Last close-out line pointing at this file and `187ce7f` / remaining CO steps.
- [ ] §11 Deferred: barrel prune of `ClientPoint` and similar public types (`etc/freegantt.api.md`). Optional later. Not this close-out.

**Files:** `plans/s4-hierarchy-and-rows/README.md` only.

**Commit:** `Point S4 README at the close-out and retarget collapse tests.`

---

### CO.4 — Gate

**Done when:** `pnpm verify && pnpm gate` is green after CO.1–CO.3 are on origin. No extra product change. Tick this box in a docs-only commit only if the README still needs a "close-out complete" line; otherwise tick it in CO.3's commit if all three product steps already landed.

- [ ] `pnpm verify && pnpm gate`
- [ ] Human box `[S4]` harness/hierarchy.html still pokeable (row sources, pack, filter, collapse, cost + undo, autoGroup without remount, import keeps scroll)

---

## 2. Constraints (already paid for)

Copy these into the session that runs a step. They are why P3 took too long.

- Layout tests do not import `data/` or `view/`.
- `model/` is types-only. `isDevMode` lives in `src/data/dev-mode.ts`.
- Public `Dataset` does not expose `fieldContext` or `datasetRevision`. The shell binds `createFieldContext({ get: (key) => dataset.field(key) }, zone)` for row callbacks.
- `Object.freeze({ ... })` on strategy objects widens literals. Use `as const satisfies SourceStrategy`.
- Window `__dataset` types in `harness/hierarchy.ts` and `harness/data.ts` must stay compatible.
- `exactOptionalPropertyTypes`: do not spread `scale?: … | undefined`.
- One commit per CO step. Push after each. Pre-push runs verify + e2e.
- Talk in ASD-STE100. Tick boxes in this file in the same change.

---

## 3. Out of scope

- Plugin runtime, `cellRenderer`, column resize — S5.
- Scheduling, `Dependency`, `schedule()` — S7.
- Pruning `ClientPoint` from the public barrel — deferred, recorded in CO.3.
- Re-running P0–P3 findings that already have commits in §0.
