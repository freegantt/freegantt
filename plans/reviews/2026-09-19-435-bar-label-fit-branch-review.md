# Branch review — `Pawel-IT/issue-435-bar-label-fit`

- **Date:** 2026-09-19
- **Base (fixed point):** `main` = `83444d5d` (merge-base `83444d5d7f4f628cbf3a82ea9893df300401a873`)
- **Head:** `08e22b15` — "Add barLabels: 'insideOrNone' for bars too narrow for a label (#435)"
- **Diff:** `git diff main...HEAD` — 12 files, +256 / −20
- **Originating issue:** freegantt/freegantt#435 — "BarLabelPolicy has no 'drop the label when it doesn't fit' option, so dense tile grids need CSS to unpaint it"
- **Gate:** `verify:full PASS — all 16 checks green, test:e2e included (81s).`
- **Format note:** the `pk-branch-review` skill asks for an HTML report; the requester specified this `.md` path, so this file is Markdown by explicit instruction.

## What the branch does

`BarLabelPolicy` gains a fifth value, `'insideOrNone'`. It reuses the fit predicate `'fitBar'` already computes (`textWidth + 2 * gapPx <= barWidth`): inside when the text fits, no label at all when it does not. `resolveBarLabelPlacement` (`src/render/dom/index.ts:230`) is restructured to compute `fitsInside` once and branch on it; `'fitBar'`'s existing behavior is unchanged. Docs (`plans/02`, `src/api/gantt.ts`, `docs/05`), the API report (`etc/freegantt.api.md`), two DOM unit tests, a harness page (`harness/bar-label-fit.{html,ts}`), and a Playwright spec (`e2e/bar-label-fit.spec.ts`) follow.

## Axis 1 — Naming

Ran the `naming` skill's five checks on `'insideOrNone'` (`src/layout/renderer.ts:101`).

| Check | Result |
| --- | --- |
| 1. Glossary (`CONTEXT.md`) | No `bar label` term exists; `fitBar`/`inside`/`outside`/`none` are not glossary entries either. The policy union is specified in `plans/02` §"Label placement (J1)". No new glossary term required. |
| 2. Call site | `barLabels: 'insideOrNone'` reads "bar labels: inside or none." True. |
| 3. Search test | A search for `insideOrNone` returns exactly the concept. Passes. |
| 4. One meaning per word | `inside` is already a policy value and a `BarLabelPlacement`. `insideOrNone` shares the root at the union declaration (`renderer.ts:101`), where both are visible together. The `OrNone` suffix disambiguates, but this is the closest call. |
| 5. Category word last | n/a for an enum string. |

The issue offered `'fitBarOrNone'` or `'insideOrNone'`. `insideOrNone` names the two observable outcomes, which is arguably more honest for an app author than `fitBarOrNone` ("fitBar but drop the fallbacks"). It passes; see **F4** for the residual judgement call. No hard naming violation found.

## Axis 2 — No re-derivation / harness stop rule

Checked against `CLAUDE.md`'s stop rule and the "harness never patches the library" paragraph.

- `harness/bar-label-fit.ts` defines its own `ViewPreset` (`tilePreset`) and `pxPerMsFor`. This looks like a workaround but is not: `minPxPerMsForPreset` (`src/time/scale.ts:152`) floors **every** `fit` mode, including an explicit number, by the preset's `minTickWidthPx` (`src/layout/viewport/time-scale-model.ts:249-260`). The shipped `dayPreset`'s floor is `96` (`src/time/presets.ts:66`), and the page needs 14px tiles. A config-object preset is the sanctioned "a new zoom level is never a library edit" seam (`CONTEXT.md`, ViewPreset). No gap.
- The harness's `--fg-row-height: 28px` (`harness/bar-label-fit.html:13`) does not restate the default (`DEFAULT_ROW_HEIGHT = 36`, `src/view/frame-settings.ts:37`); it is a deliberate page-local value. See **F8** for the divergence from sibling pages.
- `harness/main.ts` (reviewed on every branch per the stop rule) carries no new workaround: it already uses `gridWidth: 'fitColumns'` (`harness/main.ts:86`), a previous API gap that was closed. No re-derivation found.
- The fit predicate is not duplicated: `fitsInside` is computed once inside `resolveBarLabelPlacement` and no other `src/` site re-derives it.

**Verdict: the no-re-derivation rule is satisfied.** The finding from earlier reviews (a harness that stands in for library computation) does not recur here.

## Axis 3 — Simplicity, reuse, architecture, API surface

- Reuse is the branch's strongest point: one predicate, expressed once, and the new mode spends its answer instead of re-measuring.
- The API reads as the job: `barLabels: 'insideOrNone'`. The default stays `'fitBar'`, so no author sets a knob to get existing behavior.
- The new mode reaches the public surface through the existing `BarLabelPolicy`/`BarLabelSpec`/`EntryVariant.barLabels` merge path — no new type, no `if`-chain keyed by a kind, no `EntryVariant` special case.
- `BarLabelPolicy` is a config enum, not a classification, so the extra branch in `resolveBarLabelPlacement` is the existing shape, not a new smell.
- The change does not move this code toward a ball of mud.

## Findings

| id | Severity | Axis | Verdict |
| --- | --- | --- | --- |
| F1 | Medium | Spec / correctness | Confirmed |
| F2 | Low–Medium | Standards (comments) | Confirmed |
| F3 | Low | Standards (coverage) | Confirmed |
| F4 | Low (judgement) | Naming | Confirmed (not a defect) |
| F5 | Low | Standards (comments) | Confirmed |
| F6 | Low | Standards (docs) | Confirmed |
| F7 | Low | Standards (docs) | Confirmed |
| F8 | Nit | Harness consistency | Confirmed |

### F1 — `insideOrNone` misbehaves during a resize preview (Medium)

**Files:** `src/render/dom/index.ts:687-709` (`applyBarPreview`), `src/render/dom/index.ts:1148-1171` (`patch`).

`insideOrNone` is the first policy that produces *a measured label width with no placement*: `labelWidthByBarId` is set to the text width (`index.ts:1132`) while `labelPlacement` is `undefined` (`index.ts:1133`, `1144`). `applyBarPreview` flips `data-label` on the hot path only; it never adds or removes the `.fg-bar-label` child, which `patch` owns. So the child and the attribute disagree mid-drag:

- **Wide → narrow** (shrink across the fit line): `data-label` is deleted, but the `Discovery` label child survives. With no `data-label`, `.fg-bar-label` keeps its default rule (`src/view/styles.ts:416`: `overflow: hidden; text-overflow: ellipsis`), so the label still paints, clipped inside the now-too-narrow bar — exactly the `'inside'` look #435 exists to avoid. It clears only on commit.
- **Narrow → wide** (grow across the fit line): `data-label="inside"` is stamped, but no label child exists, so nothing paints until commit.

**Evidence (throwaway probe, deleted):** on an `insideOrNone` backend, `sync` a 200px bar then `applyState({ preview: [{ barId, dx: 0, dWidth: -180 }] })`:

```
BEFORE data-label= inside child= Discovery
AFTER-SHRINK data-label= undefined child= Discovery      <-- child lingers
```

and on a 20px bar widened by +180:

```
NARROW data-label= undefined child= undefined text= ""
WIDEN-PREVIEW data-label= inside child= undefined text= ""  <-- no child to paint
```

The existing hot-path test (`index.test.ts:2205`) covers `'fitBar'`, where both states own a child, so the asymmetry never showed. The e2e spec only exercises a live config change (the "Widen days" click, `e2e/bar-label-fit.spec.ts:27`, whose handler reassigns `gantt.fit` at `harness/bar-label-fit.ts:68-69`), which rebuilds the frame and therefore cannot catch this.

**Why it matters:** the policy's stated contract ("no label at all on a bar too narrow") holds on commit but not during a gesture. The issue's own consumer zooms and otherwise interacts; a resize drag is the one live path where the label reappears.

**Possible directions (report only, no redesign):** hide the lingering child on the hot path with a class/attribute toggle (the current `undefined`-means-no-attribute encoding cannot express "label exists but must not paint"), or state the limitation and pin it with a test. Either way, the hot-path behavior for this mode is currently unpinned.

### F2 — Five comments still describe `undefined` as the old two cases (Low–Medium)

**Files:** `src/layout/renderer.ts:32-35`, `src/render/dom/index.ts:205-207`, `src/render/dom/index.ts:446-451`, `src/render/dom/index.ts:698-701`, `src/render/dom/index.ts:1156-1157`, `src/render/dom/index.ts:1164-1166`.

`insideOrNone` on a too-narrow bar adds a third meaning to a `barRenderer`'s absent `label` and to `labelPlacement === undefined`. The branch updated the `BarLabelPolicy` doc (`renderer.ts:94-97`) but not the type-level comments that state the old contract:

- `BarRendererContext.label` (`renderer.ts:32-35`): "Absent when the consumer asked for no label (`barLabels: 'none'`)". Now it is also absent when the consumer asked for a label and the bar is too narrow. A plugin author reading the type gets the wrong rule, even though the policy comment two screens up states the new one.
- `BarGeom.labelPlacement` (`index.ts:205-207`): "`undefined` for no label at all (`barLabels: 'none'`, or a `barRenderer` result …)".
- `labelWidthByBarId` (`index.ts:446-451`): "`undefined` means either no label … or no 2d context". Now `defined width + undefined placement` is a state.
- `applyBarPreview` (`index.ts:698-701`): "a resize preview can cross the inside/outside fit line" — it can now cross the inside/none line, which is the F1 case.
- `patch` (`index.ts:1156-1157`, `1164-1166`): "`undefined` covers both `barLabels: 'none'` and a `barRenderer` result" and "`content === undefined && labelPlacement === undefined` only happens for `barLabels: 'none'`". Both statements are now false; `insideOrNone` on a too-narrow bar is a third source.

**Why it matters:** this repo treats comments as load-bearing API documentation. A comment that was true for four values and is false for five is a silent spec drift of exactly the kind the review process exists to catch.

### F3 — New mode's renderer contract and expert form are untested (Low)

**Files:** `src/render/dom/index.test.ts:2155-2203`.

The two new unit tests cover the default renderer at `insideOrNone` inside / none. No test covers:
- `barRenderer` + `insideOrNone` on a too-narrow bar (`ctx.label` absent) — the behavior the policy doc claims at `renderer.ts:94-97`. Existing coverage for `'none'` (`index.test.ts:2108`) exercises the same code path but not this mode, so a future reorder could regress insideOrNone's renderer contract unseen.
- The expert form `{ policy: 'insideOrNone' }` through `mergeBarLabels`/`resolveBarLabelPolicy` — the tests inject `resolveBarLabelPolicy: () => 'insideOrNone'`, bypassing the merge shell. The enum value flows through unchanged, so risk is low, but the public `BarLabelSpec` path is not pinned for it.

### F4 — Name is acceptable; residual `inside`/`insideOrNone` collision at the union (Low, judgement call)

`'insideOrNone'` passes all five naming checks and reads correctly at the call site. The only residual risk is step 4: `'inside'` and `'insideOrNone'` meet a reader at one API surface (`BarLabelPolicy`, `renderer.ts:101`), and both contain `inside`. The issue's other candidate, `'fitBarOrNone'`, would instead pair with `'fitBar'` (the two fit-based policies) and avoid the shared root, at the cost of a less direct name. This is a judgement call, not a violation; no change is required.

### F5 — The five-mode rule is restated in five places (Low)

**Files:** `src/layout/renderer.ts:86-100`, `src/render/dom/index.ts:219-229`, `plans/02-public-api.md:363-378`, `src/api/gantt.ts:158-163`, `docs/05-consumer-api.md:200`.

`CLAUDE.md`: "Comment a seam with the question it answers, not the mechanism it uses." The `BarLabelPolicy` doc comment and `resolveBarLabelPlacement`'s doc comment both narrate the mode arithmetic; the branch added `insideOrNone` prose to both, plus the spec, the option doc, and the token table. The policy comment has grown to ~15 lines. Consider stating the rule once (the type) and letting the function comment name its input's contract, but this is a style judgment, and the repo has historically favored explicit comments.

### F6 — `docs/05-consumer-api.md:200` grows a run-on cell and mixes concerns (Low)

The added sentence (≈30 words) is appended to a CSS-variable row (`--fg-bar-label-outside-color`), turning the table cell into a paragraph about `barLabels` policy behavior. It is accurate ("`insideOrNone` never reaches this rule"), but the behavior note belongs with the policy documentation (`plans/02`) rather than a custom-property reference. The `docs/` sentence-length guard does not scan this file, so nothing enforces length here.

### F7 — `BarLabelSpec.policy` doc outlived the new mode (Low)

**File:** `src/layout/renderer.ts:110-112`.

"Which side the label paints on, at whatever fit rule `BarLabelPolicy` states." For `'insideOrNone'`, the answer can be *no side at all*. One clause would restore accuracy.

### F8 — Harness page row height diverges from every sibling with no reason (Nit)

**File:** `harness/bar-label-fit.html:13`.

Every other harness page uses `--fg-row-height: 32px`; this one uses `28px`, and the library default is `36px`. It is not an API gap (it is intentionally different, and it is page CSS), but nothing says why. Either align it or comment the choice. Low value; included for completeness because the stop rule puts harness review on every branch.

## Pass 2 — independent verification

A cold `reviewer-planner` sub-agent read the report, opened every cited file, and reproduced F1 with a throwaway Vitest DOM probe (deleted; working tree clean). Result: **no finding was Mis-described, Wrong, or Unproven.** One citation corrected (F1's e2e line now points at the click, `e2e/bar-label-fit.spec.ts:27`) and one count corrected (F6, appended sentence ≈30 words, not ≈55).

| id | Verdict | Notes |
| --- | --- | --- |
| F1 | Confirmed | Probe output matched the report verbatim: `AFTER-SHRINK data-label=undefined child=Discovery`, `WIDEN-PREVIEW data-label=inside child=undefined`. `applyBarPreview` (`index.ts:687-709`) touches only `node.dataset['label']`; the child is owned by `patch` (`index.ts:1148-1171`); `labelWidthByBarId` is defined (`:1132`) with `paintedPlacement === undefined` (`:1133,1144`) — the first such pairing. |
| F2 | Confirmed | All cited comments present and now false/incomplete. `context.label` is set only when `resolvedPlacement !== undefined` (`index.ts:1121-1123`). |
| F3 | Confirmed | Only `index.test.ts:2155`/`:2178` mention `insideOrNone`; both inject `resolveBarLabelPolicy` directly (`:2162`, `:2188`) and neither uses a `barRenderer`. |
| F4 | Confirmed | `renderer.ts:101` holds `'inside'` and `'insideOrNone'`; report's own "no change required" matches. |
| F5 | Confirmed | All five sites restate the rule. |
| F6 | Confirmed | Prose is appended to the `--fg-bar-label-outside-color` cell; accurate that `insideOrNone` never reaches the rule. |
| F7 | Confirmed | `renderer.ts:110-112` says "Which side the label paints on"; `insideOrNone` can return `undefined` (`index.ts:241`). |
| F8 | Confirmed | `harness/bar-label-fit.html:13` is `28px`; all nine siblings use `32px`; default is `36`. |

## Summary

The branch does the thing #435 asked, reuses the existing fit predicate instead of re-deriving it, keeps existing policies behavior-identical, and passes the full gate. The public API surface is one new enum value with no new knob or handle. The main defect is **F1**: on the resize hot path the new mode's "no label" state cannot be expressed (the label child survives a shrink, and a widening drag paints nothing until commit), so the policy's contract is violated during a gesture even though it holds on commit. **F2** records the comment drift that the new third meaning of `undefined` created. Nothing here blocks merge once F1's hot-path behavior is either fixed or explicitly pinned.

**Verdict line:** `pk-branch-review: 8 findings (1 Medium, 1 Low–Medium, 5 Low, 1 Nit), all Confirmed by pass 2 — F1 is the one to act on; gate verify:full PASS.`
