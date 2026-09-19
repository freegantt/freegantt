# Branch review (pass 2) — `Pawel-IT/issue-435-bar-label-fit`

- **Date:** 2026-09-19
- **Base (fixed point):** `main` = `83444d5d` (merge-base `83444d5d7f4f628cbf3a82ea9893df300401a873`)
- **Head:** `cd782b73` — "Fix insideOrNone label mid-drag (F1), and close review findings F2-F8 (#435)"
- **Diff:** `git diff main...HEAD` — 14 files, +616 / −54
- **Prior pass:** `plans/reviews/2026-09-19-435-bar-label-fit-branch-review.md` (head `08e22b15`, 8 findings, all Confirmed)
- **Originating issue:** freegantt/freegantt#435 — "BarLabelPolicy has no 'drop the label when it doesn't fit' option, so dense tile grids need CSS to unpaint it"
- **Gate:** `verify:full PASS — all 16 checks green, test:e2e included (71s).`
- **Format note:** the `pk-branch-review` skill asks for an HTML report; the requester specified this `.md` path, so this file is Markdown by explicit instruction. No commit was made (requester instruction), so this report is uncommitted.
- **Scope of this pass:** the author fixed all 8 prior findings. The prior **F1** fix **changed the design**, so this pass reviews the new design. Findings here use fresh ids `R1..R7` to avoid colliding with the prior report's `F1`.

## What changed since the prior pass

The prior F1 finding: `insideOrNone` was the first policy to pair a measured label width with no placement, and `applyBarPreview` (the resize hot path) only flipped `data-label`, never mounted or removed the label child that `patch` owns. So a shrink left the child painted while the attribute said "no label", and a widening drag painted nothing until commit.

The fix introduces a private `BarLabelToken = BarLabelPlacement | 'none'` (`src/render/dom/index.ts:199-207`). `labelPlacement` in `BarGeom`, the `labelPlacementByBarId` map, `restoreBarTransform`, `applyBarPreview`, `toGeom` and `patch` now all speak that one token:

- `'inside'`/`'outside'` — the child paints on that side.
- `'none'` — the child exists, is measured, but must not paint. A new CSS rule hides it: `.fg-bar[data-label='none'] .fg-bar-label { display: none }` (`src/view/styles.ts:422-427`).
- `undefined` — no label child at all (`barLabels: 'none'`, an empty label, or a `barRenderer` result that owns the bar's content).

To make the hot-path flip possible without allocating, `toGeom` mounts the child up front for an `insideOrNone` bar that is too narrow: `canFlipToLabel = !ownsContent && policy === 'insideOrNone' && bar.label !== ''` (`index.ts:1149-1161`). `applyBarPreview` then only writes the `data-label` attribute (`index.ts:711-726`), and `restoreBarTransform` restores `'none'` the same way (`index.ts:685-698`).

## The requested focus: DOM and memory cost of the hidden child

**Question put to this pass.** Issue 435 exists because a consumer draws a dense grid of contiguous per-day tiles — hundreds of bars per row, down to 4px at a year zoom. Before this fix, a too-narrow `insideOrNone` bar carried no child at all (`defaultContent` was `{ text: '' }`). Now every one of those tiles mounts a hidden `.fg-bar-label` span holding the label text. Is that cost acceptable, and would mounting the child only for the single bar under an active gesture at gesture start serve better?

**Verdict: the cost is acceptable, and the proposed narrower fix does not serve better — it conflicts with a hard rule.**

Facts that bound the cost:

1. **The child is added once, cold.** It is created by `patch` during `syncBars`, not per frame. The hot path adds no node — the fix is specifically engineered so it does not. The new unit test proves this with a `MutationObserver`: widening an `insideOrNone` bar across the fit line adds and removes zero nodes (`src/render/dom/index.test.ts:2312-2345`).
2. **The count is windowed.** Bars are culled horizontally by `intersectsHorizontally` with a 128px overscan and vertically by the row window (`src/layout/frame.ts:459-464`, `:502-504`). So the hidden children are bounded to the visible slice, not to the dataset. For the #435 consumer at a year zoom (4px tiles, ~1200px pane, ~20 visible rows) that is roughly 300–330 per visible row, on the order of a few thousand elements.
3. **`display:none` skips layout and paint.** The hidden span is an element plus a text node, with no layout box, so it costs node memory, not frame time. Blink's per-element overhead is on the order of a few hundred bytes including its text and class attribute; a few thousand of them is single-digit MB, not a scaling wall.
4. **The mode is opt-in.** Only `barLabels: 'insideOrNone'` pays it. `'fitBar'`, `'inside'`, `'outside'` and `'none'` keep their existing child counts (the `'none'` and `barRenderer` no-child paths are still covered by the existing tests).
5. **The cost is deliberate and visible.** The e2e spec now asserts 40 `.fg-bar-label` children on 40 too-narrow tiles (`e2e/bar-label-fit.spec.ts:21-23`), so the behaviour cannot change by accident.

Why the narrower fix (mount at gesture start for the previewed bar only) is rejected:

- **It allocates on the hot path.** `plans/01` §8 and `CLAUDE.md` state the hot path — hover, selection, drag preview — is "class toggles + transforms only; zero allocation, never rebuilds a frame." The first `applyBarPreview` of a resize *is* drag preview. Mounting a child there breaks the rule the current fix exists to honour. The code comment (index.ts:720-723) already names this explicitly: "the hot path only flips the attribute, never mounts a child mid-drag."
- **It has no clean seam.** `applyState` is the only channel from `view/`/`interaction/` to the backend besides the cold `sync`. A "mount now, this bar is about to be resized" call would add a new interaction-to-renderer method — new internal surface for one case, against the "two callers, two surfaces" minimalism in `CLAUDE.md`.
- **A tempting variant also fails.** One might mount only for the bar whose `resizableEntryId` is set, since handles appear on one entry (`src/render/backend.ts:17-24`). But `resizableEntryId` and selection arrive through `applyState` (hot), and selection can change with no `sync`. A bar selected after its last `sync` would still be missing its child when a resize starts — the original F1 bug returns. So the safe, rule-compliant set really is "every too-narrow `insideOrNone` bar".
- **A pseudo-element approach** (`content: attr(...)` instead of a child) would remove the node but forks the label away from the public `.fg-bar-label` hook (`docs/05-consumer-api.md:340`) and from the one reconcile path — a worse trade.

One residual over-mount is real and worth naming, not fixing now: a bar that can never be resized (`capabilities.resize: false`) still gets the hidden child. The renderer does not receive capability resolution at `sync` — that lives in `src/view/capability.ts` and reaches the backend only through `InteractionState`. Gating on it would thread a view concern into the frame. Recorded as an opportunity; do not act without a consumer asking.

**Recommendation:** keep the design. State the cost tradeoff in the `BarLabelToken` comment (it currently explains why the child must exist but not what it costs), and if a dense-grid consumer reports memory pressure, add a browser heap benchmark before considering any of the rejected narrowings.

This is **R2** below.

## Axis 1 — Naming

Ran the `naming` skill's five checks on the new names.

- **`BarLabelToken`** (`src/render/dom/index.ts:199-207`). Call site: `new Map<BarId, BarLabelToken | undefined>()`. Reads "bar label token." True — it is the token `patch` writes to `data-label`. Glossary: no entry needed (it is a DOM attribute value, not a domain concept; `plans/02` §J1 governs). Search test: specific. Check 4: it shares the `BarLabel` root with `BarLabelPolicy`/`BarLabelPlacement`/`BarLabelSpec`/`BarLabels`, but `Token` disambiguates and they are a recognized family. Check 5: `Token` is the category word, `BarLabel` precedes it. Passes.
- **`'none'` as the token value.** Fails check 4. See **R1**.
- **`canFlipToLabel`** (`index.ts:1156`). Call: `const canFlipToLabel = !ownsContent && policy === 'insideOrNone' && bar.label !== ''`. Reads "this bar can flip to a label." True for the resize flip. Gesture-oriented name on a cold path, but honest and greppable. Passes. Minor: `mayRevealLabel` would match the CSS word "hidden/reveal"; not worth a change.

## Axis 2 — Standards, spec, comments

- The prior F2 comment drift is fixed: `renderer.ts:32-35`, `index.ts:214-218`, `:458-463`, `:691-694`, `:1184-1197` all now state the third meaning of an absent label.
- The prior F6 docs revert landed (no `docs/05` diff against `main`), and F7 (`renderer.ts:110-112`) and F8 (`harness/bar-label-fit.html:13-14`) are fixed.
- **New drift:** `plans/02-public-api.md:390` still says `ctx.label` "is absent under `barLabels: 'none'`". It is now also absent under `'insideOrNone'` on a too-narrow bar — the exact sentence `renderer.ts:32-35` was corrected to carry. See **R3**.
- **Rule restatement:** the prior F5 (five places) is now larger. `plans/02` §J1 narrates the whole mechanism, including the CSS rule, and `BarLabelPolicy`'s doc comment grew again. See **R5**.

## Axis 3 — Simplicity, reuse, architecture, API surface

- Reuse holds: one `fitsInside` predicate, computed once; `'fitBar'` behaviour is byte-for-byte unchanged (the reordering in `resolveBarLabelPlacement` is behaviour-preserving for all four old values).
- The public surface grows by one enum value and one `data-label` token. No knob, hook or handle an app author must set to get existing behaviour; the default stays `'fitBar'`.
- The token reaches the surface through the existing `BarLabels`/`BarLabelSpec`/`EntryVariant.barLabels` merge path. No `if`-chain keyed by a variant; the policy is consulted, not the variant name.
- Residual coupling: the decision "a hidden child exists" is reconstructed at two call sites from different inputs. `toGeom` derives it from `policy`/`bar.label`; `applyBarPreview` maps any `undefined` placement to `'none'` and relies on the separate `labelWidthByBarId` map being defined only when a child will exist. The invariant is real but implicit. See **R4**.
- `harness/main.ts` (reviewed on every branch per the stop rule) is unchanged and clean. The new harness page's `tilePreset` is the sanctioned config-object preset; `gantt.fit = pxPerMsFor(...)` is the official `TimeScaleFit` expert form. No re-derivation, no API gap.

## Findings

| id | Severity | Axis | Verdict |
| --- | --- | --- | --- |
| R1 | Medium | Naming / public hook | Confirmed |
| R2 | Medium (design judgement) | Architecture / performance | Confirmed |
| R3 | Low | Spec / docs | Confirmed |
| R4 | Low | Simplicity | Confirmed |
| R5 | Low | Comments / docs | Confirmed |
| R6 | Nit | Docs | Confirmed |
| R7 | Nit | Test coverage | Confirmed |

### R1 — `data-label='none'` collides with `barLabels: 'none'` (Medium)

**Files:** `src/render/dom/index.ts:199-207`, `:1184-1189`; `src/view/styles.ts:422-427`; `plans/02-public-api.md:374-381`.

Two different concepts now answer to the word `none`, and they meet on one element and in one doc section:

- `barLabels: 'none'` — the consumer asked for no label. **No child is mounted.**
- `data-label='none'` — the child exists, measured, and is hidden. The label **is** present.

The naming skill's step 4 says a word shared by two concepts that meet the reader in one place is a bug. The reader meets both at `.fg-bar` (a consumer writes `[data-label='none']` in a stylesheet) and in `plans/02` §J1. `[data-label='none']` reads as "this bar has no label", which is the opposite of the DOM truth.

**Fix:** name the DOM token `'hidden'`: `.fg-bar[data-label='hidden'] .fg-bar-label { display: none }`, `type BarLabelToken = BarLabelPlacement | 'hidden'`. The word then describes the observable state and no longer borrows a policy value. The branch is pre-1.0 and unshipped, so this is cheap now and expensive after release. (The F1 author saw the split — the comment at `index.ts:200-206` spells it out — but chose to reuse the policy word.)

### R2 — the hidden child's DOM/memory cost is acceptable, but the tradeoff is undocumented (Medium, design judgement)

**Files:** `src/render/dom/index.ts:1149-1161`, `:199-207`; `e2e/bar-label-fit.spec.ts:21-23`; `src/layout/frame.ts:459-464`.

See "The requested focus" above for the full evidence and the verdict. Summary: the mode is opt-in, the children are windowed to the visible slice, and `display:none` removes them from layout and paint, so the cost is bounded node memory (single-digit MB at the issue's worst case), not frame time. The proposed narrower fix — mount at gesture start — allocates on the hot path, which `plans/01` §8 and `CLAUDE.md` forbid, and needs a new interaction-to-renderer seam. It does not serve better. The one gap is that the `BarLabelToken` comment explains the mechanism but never states the cost; add one line so a future reader weighs it knowingly.

### R3 — `plans/02:390` says `ctx.label` is absent only under `'none'` (Low)

**File:** `plans/02-public-api.md:390`.

"A `barRenderer` result … reads the same answer: `ctx.label` … is absent under `barLabels: 'none'`." It is now also absent under `'insideOrNone'` on a bar too narrow for its label. `src/layout/renderer.ts:32-35` was updated for exactly this; the prose two pages away was not. One clause restores accuracy: "… absent under `barLabels: 'none'` and under `'insideOrNone'` on a bar too narrow."

### R4 — the "hidden child exists" decision is reconstructed at two call sites (Low)

**Files:** `src/render/dom/index.ts:1156-1159` (`canFlipToLabel`), `:724` (`const token = placement ?? 'none'`), `:1130`/`:1160` (`labelWidthByBarId`).

`applyBarPreview` cannot receive `'none'` from `resolveBarLabelPlacement` directly because that function answers the *placement* question and returns `undefined` for both `'none'` and `'insideOrNone'`-too-narrow. So the hot path maps every `undefined` to `'none'`, which is correct only because `labelWidthByBarId` is `undefined` for a `'none'`-policy or `barRenderer` bar. That cross-map invariant is not expressed in the types or the code. It is not a bug — the guard at `:716` returns before the map is consulted — but a future edit could break it silently. A short comment naming the invariant, or a helper that returns the token, would make it explicit.

### R5 — the five-mode rule is now restated in six-plus places (Low)

**Files:** `src/layout/renderer.ts:86-101`, `src/render/dom/index.ts:230-237`, `plans/02-public-api.md:363-381`, `src/api/gantt.ts:158-160`, `docs/05-consumer-api.md:200` (the outside-color row), `src/view/styles.ts:417-427`.

`CLAUDE.md`: "Comment a seam with the question it answers, not the mechanism it uses." §J1 now narrates the fit predicate, the fallback, the `data-label` values, when a child exists, the hot-path reason, and the CSS rule. `api/gantt.ts:158-160` already shortens to "see its own doc for the five values" — that is the right instinct. Consider letting the `BarLabelPolicy` type own the mode arithmetic, `plans/02` own the observable contract (data-label values, when a child exists), and the code own the mid-drag why. Judgement call, as in the prior pass; not a blocker.

### R6 — `docs/05` class table omits the hidden state (Nit)

**File:** `docs/05-consumer-api.md:340`.

`.fg-bar-label` is described only as "The bar's own text child." The class table's neighbour row (`--fg-bar-label-outside-color`, line 200) already references `data-label='outside'`, so a reader of the consumer doc can see placement but not that an `insideOrNone` label child can be present and hidden by default. One clause — "hidden until its bar is wide enough (`barLabels: 'insideOrNone'`)" — closes it. Low value.

### R7 — the empty-label guard is unpinned (Nit)

**File:** `src/render/dom/index.test.ts:2155-2345`.

`canFlipToLabel` includes `bar.label !== ''` so an empty label mounts no hidden child. No test covers an empty label under `'insideOrNone'`; the guard could be dropped in a refactor and the only signal would be an empty hidden span per bar. A one-case test pins it. The `'none'` no-child path is already covered elsewhere.

## Prior findings — resolution

| id | Prior severity | Status | Evidence |
| --- | --- | --- | --- |
| F1 | Medium | **Fixed** — design assessed in R2 | Two new unit tests (`index.test.ts:2272` shrink, `:2312` widen) prove `applyBarPreview` no longer disagrees with the child. The e2e does **not** cover the mid-drag case: its buttons reassign `gantt.fit` (`harness/bar-label-fit.ts:65-70`), a cold rebuild the prior pass said "cannot catch this." |
| F2 | Low–Medium | Fixed | `renderer.ts:32-35`, `index.ts:214-218`, `:458-463`, `:691-694`, `:1184-1197`. |
| F3 | Low | Fixed | barRenderer test `index.test.ts:2208`; merge-shell test `src/view/bar-labels.test.ts:108-124`. |
| F4 | Low (judgement) | No change required | `renderer.ts:101` unchanged; still passes. |
| F5 | Low | Partially — restatement grew; see R5 | — |
| F6 | Low | Fixed | `docs/05` reverted to `main` (absent from `git diff main...HEAD`). |
| F7 | Low | Fixed | `renderer.ts:110-112`. |
| F8 | Nit | Fixed | `harness/bar-label-fit.html:13-14` comments the 28px choice. |

## Pass 2 — independent verification

A cold `general` sub-agent (no `reviewer-planner` agent type is registered in this session) read the report, opened every cited file, and checked the central R2 design claim against the shipped tests. It created no throwaway files and left `git status --porcelain` at one untracked entry: this report.

| id | Verdict | Notes |
| --- | --- | --- |
| R1 | Confirmed | `BarLabelToken` at `index.ts:207`; policy `'none'` mounts no child (`index.test.ts:2138-2146`) while `data-label='none'` mounts a hidden child (`:2199-2200`); both words meet at `.fg-bar` and `plans/02:377`. |
| R2 | Confirmed | Hidden child mounted at `index.ts:1156-1159`/`:1198-1201`; hot path touches `dataset` only (`:724-726`); CSS rule exists and hides (`styles.ts:427`); horizontal cull at `frame.ts:459-464`, `:502-504`. The absolute byte figures are estimates, not measurements — the report says so. |
| R3 | Confirmed | `plans/02:390` omits the too-narrow `insideOrNone` case that `renderer.ts:32-35` carries. |
| R4 | Confirmed | `canFlipToLabel` at `:1156`, `?? 'none'` at `:724`, guard at `:716` precedes the `labelWidthByBarId` read at `:719`; invariant implicit. |
| R5 | Confirmed | All six cited restatement sites verified. |
| R6 | Confirmed | `docs/05:340` reads "The bar's own text child." with no hidden-state note. |
| R7 | Confirmed | Only empty-label test is `index.test.ts:1959`; `paintingBackend` omits `resolveBarLabelPolicy`, so it defaults to `'fitBar'`; no `insideOrNone` empty-label test. |
| F1 | **Mis-described (evidence cell corrected)** | Fix real; but it added two unit tests, not three (`:2208` is F3's), and the e2e has no mid-drag path. Row above corrected. |
| F2 | Confirmed | Five comments carry the third meaning. |
| F3 | Confirmed | `index.test.ts:2208`; `bar-labels.test.ts:113-123`. |
| F4 | Confirmed | `renderer.ts:101`; "no change required" holds. |
| F5 | Confirmed | Restatement grew; "Partially" accurate. |
| F6 | Confirmed | `git diff main...HEAD -- docs/05-consumer-api.md` empty. |
| F7 | Confirmed | `renderer.ts:110-111` corrected. |
| F8 | Confirmed | Comment at `harness/bar-label-fit.html:13-14` (was cited as `:12-13`); substance correct, citation fixed. |

**Pass 2 design check.** The sub-agent did not need a throwaway probe: the branch's own tests settle it. `index.test.ts:2312-2345` asserts `mutations === 0` while `applyBarPreview` widens a too-narrow `insideOrNone` bar, and it passed. `index.test.ts:2178-2206` asserts `data-label='none'` **and** a populated `.fg-bar-label` child. The e2e `toBeHidden()` assertion passed in real Chromium. So all four R2 sub-claims hold: child mounted, hot path allocation-free, CSS applies, count windowed.

**Gate (pass 2, re-run):** `verify:full PASS — all 16 checks green, test:e2e included (72s).`

**Harness stop rule:** no re-derivation or gap patch. `harness/main.ts` is unchanged and still uses `gridWidth: 'fitColumns'` (`:86`), with none of the three past workaround markers. The new page's own `ViewPreset` (`harness/bar-label-fit.ts:39-46`) is the sanctioned config-object-preset seam — the shipped `dayPreset` floor blocks 14px tiles — and `gantt.fit = pxPerMsFor(...)` is the documented `TimeScaleFit` number form. The page computes only its own input density.

## Summary

The F1 fix is correct and rule-compliant. It makes `applyBarPreview`, `restoreBarTransform`, `toGeom` and `patch` speak one token, and it is the only design that keeps the hot path allocation-free while still having a child to reveal mid-drag. The requested concern — per-tile hidden spans in the #435 dense grid — resolves in the fix's favour: the cost is opt-in, windowed, layout-free node memory, and the proposed gesture-start alternative violates the zero-allocation hot-path rule. The one real fault is **R1**: `data-label='none'` reuses the policy word for the opposite meaning, and a consumer stylesheet is the reader who gets misled. Fix that rename before release; document the cost (R2) and correct `plans/02:390` (R3) alongside it.

**Verdict line:** `pk-branch-review pass 2: 7 findings (2 Medium, 3 Low, 2 Nit), all Confirmed by pass 2; hidden-child DOM/memory cost judged acceptable and the gesture-start narrowing rejected as hot-path allocation; one prior-pass citation corrected; gate verify:full PASS.`
