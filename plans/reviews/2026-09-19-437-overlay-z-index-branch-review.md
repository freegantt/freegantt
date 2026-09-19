# Branch review — `Pawel-IT/issue-437-overlay-z-index` (#437)

- **Branch:** `Pawel-IT/issue-437-overlay-z-index`
- **Base (fixed point):** `main` (diff: `git diff main...HEAD`)
- **Commit under review:** `58e274bd` — "Give the overlay layer an explicit stacking position above every internal layer"
- **Date:** 2026-09-19
- **Closes:** issue #437 — `.fg-overlay` had no `z-index` and lost to `.fg-col-header[data-dragging]` (z 2), so a context-menu popup painted under a dragged column header and refused clicks in the covered band.

Scope of the diff:

| File | Change |
|---|---|
| `src/view/styles.ts` | `+41/-11` — two internal tier constants, `--fg-z-overlay`, six z-index rules rewritten to use them |
| `docs/05-consumer-api.md` | `+1` — documents `--fg-z-overlay` |
| `e2e/plugins.spec.ts` | `+43` — a new regression test for #437 |
| `test/guards/theming-contract.test.ts` | `+18/-1` — a `transform` hook so the guard can resolve a computed default |

## Verdict of this pass

The fix is correct and the regression test is real. I verified the e2e test **passes with the fix and fails with the overlay's `z-index` removed** (temporary revert, then restored). `pnpm verify` exits 0 on the branch. The findings below are about the guard's soundness and comment/name accuracy, not about whether the bug is fixed.

---

## Findings

### F1 — The guard's `transform` re-implements `+ 1`; it cannot catch a changed formula

- **Severity:** Medium
- **Files:** `test/guards/theming-contract.test.ts:102–105`, `:166–175`, `:202–204`; `src/view/styles.ts:98`

The new entry registers `--fg-z-overlay` by matching `INTERNAL_Z_RAISED`'s line and adding `1` in the test:

```ts
pattern: /const INTERNAL_Z_RAISED = (\d+);/,
unit: '',
transform: (raw) => raw + 1,
```

The doc comment above the interface says the transform "runs on the captured number before it is compared to the doc, so the guard checks the same arithmetic the sheet itself runs." It does not. It re-derives the sheet's `+ 1`; it never reads the sheet's expression. If `DEFAULT_OVERLAY_Z_INDEX` in `styles.ts:98` changes to `INTERNAL_Z_RAISED + 2`, the sheet ships `4`, the guard still computes `2 + 1 = 3`, the doc still says `3`, and the guard stays green while the shipped default drifts from its published value. That is exactly the drift this test exists to catch.

**Fix direction:** capture the addend from `styles.ts` (match `const DEFAULT_OVERLAY_Z_INDEX = INTERNAL_Z_RAISED \+ (\d+);`, or capture both operands) so the guard evaluates the sheet's own arithmetic instead of duplicating it.

### F2 — The computed default is convention-only; the trailing clause overstates it

- **Severity:** Low (downgraded in pass 2)
- **Files:** `src/view/styles.ts:86–98` (claim at `:93–95`)

The comment says:

> `DEFAULT_OVERLAY_Z_INDEX` is computed from the higher tier, not written as its own literal, so a third internal tier can only raise this default by raising `INTERNAL_Z_RAISED` itself — it can never drift out of step with what it must clear.

Pass 2 corrected the first account: "can only raise this default by raising `INTERNAL_Z_RAISED` itself" places the obligation on the future author, which is exactly the finding's restatement — the comment does not claim an automatic guarantee. The genuine defect is the trailing clause. The code computes the default from exactly one named constant (`INTERNAL_Z_RAISED + 1`), so "it can never drift out of step with what it must clear" is false for any future tier declared above `INTERNAL_Z_RAISED`: a third tier at `3` used by a rule leaves the overlay at `3`, and #437 returns unless someone remembers to bump `INTERNAL_Z_RAISED`. This is a documentation overstatement plus a convention, not a code defect.

**Fix direction (preference, not a bug):** model the tiers as a collection and derive the default from the maximum, e.g. `const INTERNAL_Z = { base: 1, raised: 2 } as const; const DEFAULT_OVERLAY_Z_INDEX = Math.max(...Object.values(INTERNAL_Z)) + 1;`, so a new tier is automatically considered. Failing that, drop the "can never drift" clause.

### F3 — Stale comment: `decorations.ts` still says `.fg-overlay` has no `z-index`

- **Severity:** Low
- **Files:** `src/render/dom/decorations.ts:77–78`

```
* gives the paint order, the same way `.fg-overlay` sits above both panes with no z-index.
```

The overlay now carries `z-index: var(--fg-z-overlay, …)` (`styles.ts:523`). The commit updated the `.fg-overlay` rule's own comment and `pane-layout.ts:171`, but missed this copy. A reader of `attachDecorations` is told the opposite of what the sheet does.

**Fix:** delete the `with no z-index` clause, or restate it as "the same way `.fg-overlay` owns an explicit stacking position above both panes (styles.ts)."

### F4 — Names: `INTERPOLATED_PIXEL_TOKENS` no longer holds only pixel tokens; the tiers are not parallel

- **Severity:** Low (naming)
- **Files:** `test/guards/theming-contract.test.ts:108`; `src/view/styles.ts:96–97`

The map `INTERPOLATED_PIXEL_TOKENS` now carries `--fg-z-overlay`, a unitless stacking position. The name says every entry is a pixel length. The interface comment at `:90–95` already reaches for the generic phrase "tokens whose `:root` declaration interpolates a TypeScript constant" — the code name did not follow.

`INTERNAL_Z_BASE` / `INTERNAL_Z_RAISED` are also not parallel: one names a level, the other a state, and neither says which direction "raised" goes relative to "base". Two tiers numbered or ordered (`INTERNAL_Z_LOW`/`INTERNAL_Z_HIGH`, or `INTERNAL_Z_TIER_1`/`_TIER_2`) read as one scale.

**Fix:** rename the map to match what it holds (`INTERPOLATED_TOKENS` or `INTERPOLATED_TS_DEFAULT_TOKENS`), and give the two tiers parallel names.

### F5 — The new e2e comment names the wrong competing element

- **Severity:** Low
- **Files:** `e2e/plugins.spec.ts:35–36`

```
// lands on an already-visible point. Before #437, `.fg-overlay` carried no z-index and lost to
// `.fg-grid-header`'s (styles.ts) — the menu painted, but the header painted over it, and the
```

The test right-clicks the **timeline** pane (`:45–50`). The mouse path anchors the menu at the click point, `new DOMRect(event.clientX, event.clientY, 0, 0)` (`src/extensions/features/context-menu.ts:193`) — the pane-top-left anchor at `:206` is the `Shift+F10` keyboard path. At the asserted point `x` sits at the timeline pane's horizontal centre, so the pre-fix element that wins is `.fg-header` (timeline, `z-index: 1`, `styles.ts:348`), not `.fg-grid-header` (grid pane, `styles.ts:300`, a different horizontal box). The `gridHeaderBox` check at `:58–65` only samples its vertical range, so it is a proxy, and `elementFromPoint` never touches `.fg-grid-header` in this scenario. The test still pins the bug (verified: it fails without the fix), but the comment misstates which node it defeats.

**Fix:** name `.fg-header` as the competing layer, or reword to "the sticky pane header".

### F6 — The token taxonomy comment in `styles.ts` still lists only metric and colour

- **Severity:** Low
- **Files:** `src/view/styles.ts:45–62`

The file header explains that two kinds of `--fg-*` property share the prefix, and defines a CONSUMER TOKEN as "every metric and colour this sheet's own rules read as `var(--fg-x, default)`". `--fg-z-overlay` is neither a metric nor a colour, yet it is declared in `METRIC_TOKENS` (`:247`) and consumed as a `var(..., default)` — a third kind by the comment's own definition. The taxonomy a reader relies on to place a new token did not move with the token.

**Fix:** extend the paragraph to name stacking positions alongside metrics and colours, or say "every non-colour consumer value".

### F7 — The new e2e comment claims the menu anchors at the pane's top-left; the mouse path anchors at the click point

- **Severity:** Low
- **Files:** `e2e/plugins.spec.ts:31–32` (raised in pass 2)

```
// the "Collapse all"/"Expand all" menu anchored at the pane's own top-left corner (D-S5-14) — the
```

The `contextmenu` mouse path opens at the pointer: `openAt(new DOMRect(event.clientX, event.clientY, 0, 0), target)` (`src/extensions/features/context-menu.ts:193`). The pane's own top-left corner is the `Shift+F10`/keyboard anchor (`:201–206`). The test drives the mouse, so its menu is anchored at the click point (timeline centre, pane top + 5), not the pane corner. Same defect family as F5: a comment that describes the keyboard path while citing a mouse-path test.

**Fix:** say the menu opens at the clicked point inside the timeline pane's header band, or name the anchor rule as "D-S5-14's mouse path".

---

## Positive observations

- **The fix is minimal and correct.** One property on `.fg-overlay`, defaulted to sit above the internal tiers; `pointer-events: none` on the layer and `auto` on `.fg-popup` are preserved, so an empty overlay still never blocks the panes.
- **The regression test is real, not decorative.** I temporarily removed the overlay's `z-index` and re-ran it: it failed at `e2e/plugins.spec.ts:71` (`hitsMenuItem` false), then passed once restored. It pins `document.elementFromPoint`, the same resolution the issue reported, so it tells "painted" from "clickable" apart.
- **The guard test passes** (`pnpm vitest run test/guards/theming-contract.test.ts` → 13/13), and `pnpm verify` exits 0.
- **No new knob is required for default behaviour**, and no app author meets a hook or handle to get the overlay on top.
- **`harness/main.ts` is clean.** The page installs `contextMenu()` from `plugins: [...]` and writes no `z-index` of its own; the new token did not tempt a harness workaround. No API gap.

## Pass-2 verification

Verdicts from a fresh sub-agent, one per finding id. Where a verdict was `Mis-described`, the account above is already replaced with the correct one and the finding kept; `Wrong` would have been struck; `Unproven` would name the run that settles it. The verifier also surfaced F7, which it confirmed.

| id | verdict | evidence |
|---|---|---|
| F1 | **Confirmed** | Guard reads `INTERNAL_Z_RAISED` (2) then adds `1` (`theming-contract.test.ts:172–174`, `:203`); it never reads `DEFAULT_OVERLAY_Z_INDEX`. Changing `styles.ts:98` to `+ 2` leaves the guard green at `3` while `METRIC_TOKENS` ships `4`; no other guard catches it. |
| F2 | **Mis-described** | Quoted sentence places the obligation on the future author; the finding's "claimed auto-guarantee" framing was wrong. Account replaced above: a low doc overstatement, not a code defect. |
| F3 | **Confirmed** | `decorations.ts:77–78` says "with no z-index"; `styles.ts:523` now sets one. |
| F4 | **Confirmed** | `theming-contract.test.ts:108` name vs `:170–175` `unit: ''` entry; `styles.ts:96–97` non-parallel tier names. |
| F5 | **Confirmed** | `.fg-grid-header` (`styles.ts:300`) is in the left grid pane; `.fg-header` (`:348`, `z-index: 1`) is the timeline header. Test clicks the timeline pane (`e2e:50`), so pre-fix `elementFromPoint` returns `.fg-header`. Verifier's own note: the finding cited `context-menu.ts:206` (keyboard path) instead of `:193` (mouse path); corrected above. |
| F6 | **Confirmed** | `styles.ts:46` defines a consumer token as "metric and colour"; `--fg-z-overlay` is neither, declared at `:247`, read at `:523`. |
| F7 | **Confirmed** | Raised by the verifier; mouse path anchors at the pointer (`context-menu.ts:193`), not the pane corner (`:201–206`). |

## Final verdict

Ship-ready: the bug is fixed and pinned by a test that was verified to fail without the fix; the only open findings are a guard hole (F1) and comment/name accuracy (F2–F7), none of which block #437.

