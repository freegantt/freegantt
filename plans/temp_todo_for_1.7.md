# Temp plan — finish everything up to and including S1.7

**Written:** 2026-08-25 · **Baseline:** `main` @ `5eb6631` · **Scope:** close out S1.5, clear the blocking tracker debt, land S1.7 (and S1.7b).
**Source specs:** [`plans/s1.5-scroll-model/README.md`](s1.5-scroll-model/README.md) · [`plans/s1.7-windowed-frame/README.md`](s1.7-windowed-frame/README.md) · issue #1 · issue #8.
**Status of this file:** working document. It is not a spec — the two READMEs are. Delete it when S1.7b closes.

---

## 1. Verified state of the repository

| Fact | Evidence |
|---|---|
| `pnpm verify` is green (format, typecheck, lint, boundaries, guards, pure + dom tests, vendor-names, disables, build) | run at `5eb6631`, exit 0 |
| S1.4, S1.5, S1.6 code has shipped | `src/layout/viewport/{scroll-model,time-scale-model}.ts`, `src/layout/row-height-index.ts`, `src/view/scroll-attachment.ts`, `e2e/scroll-sync.spec.ts` |
| S1.5's own TODO (§9) has **no** unticked boxes | `grep '^- \[ \]' plans/s1.5-scroll-model/README.md` → no results |
| Issue #9 (S1.5 tracker) is closed | not in `gh issue list --state open` |
| #54's rename is fully applied — repo **and** tracker | no `attachSize` / `size-attachment` / `SizeAttachment` / `resize-binding` in `src/`, `plans/01`, `CONTEXT.md`, or issue #1's body and comments |
| `GanttShell.#renderHeader` (R2, the second render path) is already gone | header ticks render through `render/dom`'s reconciler (`src/render/dom/index.ts:54,121`) |
| `no-time-to-pixel-math` **does not exist** although `docs/02` §5 lists it active from S0 | `ls eslint/rules/` — only `no-date-outside-time`, `no-instant-arithmetic`, `no-magic-time-constants`, `no-scroll-outside-scroll-model` |
| The S1 slice gate cannot be machine-checked | `node scripts/slice-gate.mjs` → "no automated checklist defined yet for slice S1" (S1.11 work, not now) |

**So: the "last tick on S1.5" is not code.** The spec is complete and green. What is unticked is the `- [ ] S1.5` box in the body of issue #1 — a bookkeeping line, item T1 below.

---

## 2. Fix before S1.7 code starts

Three items. Only T3 is engineering; T1 and T2 are tracker hygiene that an agent reading the repo will otherwise take as live work.

- **T1 — Tick S1.5 in issue #1's body** and link `plans/s1.5-scroll-model/README.md` §9 as the evidence. Also tick S1.5 anywhere else the step list is mirrored. *Why first:* the next agent reads issue #1 as the plan of record and will re-open settled work.
- **T2 — Close #54.** Every site it names is fixed (repo and tracker, verified above). While there: retitle **#8** from "Size attachment: …" to "Pane-size attachment: …" — the title is the last place the retired term survives; #8's body already says `attachPaneSize`.
- **T3 — Correct the two docs that describe a rule that does not exist.** `docs/02` §5 lists `3.2` (`no-time-to-pixel-math`) as active from S0, and `docs/01` §I12 names the scroll half `no-raw-scroll` instead of the shipped `no-scroll-outside-scroll-model`. Land these **with** the rule in Phase 1 rather than as a separate pass — but do not let Phase 2 start on a docs table that claims enforcement that is not there.

**Not blockers — recorded so they are not re-litigated:**

| Issue | Verdict |
|---|---|
| **#41** — harness owns `overflow: auto`, restates row height | *Half already fixed:* `harness/index.html` now uses `--fg-row-height: 32px` as a token the library reads, not a restated default, so Problem 2 is closed. What is left is `overflow: auto` (the library owns the scroll *position*, not the pane) → S1.8's pane split, and `.fg-*` class names with no parts vocabulary → S1.10. **Action: edit the issue down to the remaining half** so it stops reading as S1.7 work. |
| **#33** — `GanttShell` captures entries by reference | S2 by design (`plans/03` S2: changeset-driven invalidation). Deliberately not fixed here; do not add `setEntries()` in the meantime (#1's R4). |
| **#15 / #16** — plugin resolve hook, scheduling plugin | S3. Untouched. |
| **#8** — pane size never re-measures | *Is* S1.7b, Phase 7 below. |
| **#1** — the umbrella | Stays open until S1.11. |

---

## 3. Two decisions settled, before Phase 4 and Phase 6

- **A single band renders a `.fg-band` wrapper element.** §3.7's "one `.fg-band` row" wins over D-S1.7-6's "byte-identical" — the wrapper ships now so S1.9's multi-band presets need no second seam change. "Byte-identical" becomes "one wrapper deeper"; `harness/index.html`'s CSS and any selector in `e2e/harness.spec.ts` that assumes `.fg-tick` is a direct child of `.fg-header` move to account for it, in the same commit as Phase 6. The S1.7 README is corrected to match (§8 D of that phase) rather than left with the two sentences disagreeing.
- **The §0 defect (the local-clamp / culling-window mismatch) is fixed inside S1.7, not filed separately.** The fix is one line inside `Viewport.visible` (D-S1.7-2), the object Phase 5 introduces, and U3's e2e case is the test that proves it. Filing it separately would mean writing the same line twice.

---

## 4. Phases

Nine commits. Each ends green on `pnpm verify`. Guardrails and types land before the code they guard (`plans/04` §3.2/§3.3), then `time/`, then `layout/`, then the DOM edge — the order the S1.7 README §8 sets.

### Phase 0 — Close out S1.5 (no code)
- [x] T1 — tick `S1.5` in issue #1's body, citing `plans/s1.5-scroll-model/README.md` §9
- [x] T2 — close #54; retitle #8 to "Pane-size attachment: …"
- [x] Edit #41 down to its remaining half (overflow → S1.8, parts vocabulary → S1.10)

### Phase 1 — Guardrail: `no-time-to-pixel-math` (S1.7 §8 "Guardrails")
- [x] `eslint/rules/no-time-to-pixel-math.cjs` — type-aware, allowlist `src/time/scale.ts`; register in `eslint/rules/index.cjs` and `eslint.config.js`
- [x] `eslint/rules/no-time-to-pixel-math.test.cjs` + red fixture under `eslint/rules/fixtures/`; confirm `scripts/guard-red-test.mjs` fails on it
- [x] T3 — `docs/02` §5 moves 3.2 from "active S0" to S1; `docs/01` §I12 names `no-scroll-outside-scroll-model`

### Phase 2 — Types and errors (S1.7 §3.1, §3.2)
- [ ] `src/model/errors.ts` — `FreeGanttError` (with `code`), `UnsupportedUnitError`; re-export from `src/model/index.ts`
- [ ] Widen `model/`'s stated runtime carve-out in `CLAUDE.md` and `plans/01` §1.1 — "id/brand helpers **and the `FreeGanttError` base**" (D-S1.7-8)
- [ ] Move `DatasetLike` (`src/view/gantt-shell.ts:15`) → `src/model/dataset.ts`, renamed **`Dataset`**; `api/dataset.ts`'s class gains `implements DatasetContract` against the aliased import
- [ ] `ScaleBinding = Dataset & { readonly paneWidth: number }` — the S1.5 claim that could not ship then (§3.8 E)
- [ ] `docs/adr/0004:22` — `DatasetLike`'s home and new name

### Phase 3 — `time/` (S1.7 §3.3)
- [ ] `startOf(zone, i, unit)` as a `floor` column on the existing `STEPPERS`/`UNITS` registry — one list of supported units, #32's fix kept
- [ ] `TickStep`; `ViewPresetHeader extends TickStep`
- [ ] `ticks(step, span)` — required span, boundary-aligned, **cell** intersection (the cell covering `span.x` is emitted even when its own `x` is left of the span), `Tick.width` to the next boundary
- [ ] `TimeScale.contentWidth`
- [ ] `stepBy` / `ticks` throw `UnsupportedUnitError`; `pxPerMsForPreset` and `instant()` deliberately keep `RangeError` (§3.8 F)
- [ ] Tests per §6, including the DST case where `Tick.width` sums to the range

### Phase 4 — `layout/frame.ts` (S1.7 §3.4, D-B)
- [ ] `LayoutInput.viewport` / `GeometryFrame.viewport` → `visible: Rect`; add `Overscan` (`{ verticalRows?, horizontalPx? }`, default `{ 2, 128 }`)
- [ ] `FrameHeaderBand`, `FrameHeaderTick.width`, `FrameHeader.bands` — one band per `preset.headers` entry, coarsest first
- [ ] Vertical culling expanded in **index** space by `verticalRows`; horizontal culling of bars and band ticks by `horizontalPx`; **rows stay vertical-only**
- [ ] A zero dimension disables that axis' culling; `contentWidth`/`contentHeight` stay the full extent
- [ ] `contentWidth` read from `scale`, not re-derived from two `xForInstant` calls (`frame.ts:171`)
- [ ] Tests per §6 **including I8 under scroll** — the id set for the overlapping region is identical before and after a window move

### Phase 5 — `Viewport`, the fan-in (S1.7 §3.5, D-S1.7-1/2)
- [ ] `src/layout/viewport/viewport.ts` — `ViewportOptions`, `ViewportHandle { unbind, setPaneSize, setContentSize }`, `bind(dataset, onChange)`, `timeScale`, `preset`, `overscan` (live), `visible`, `batch(run)`
- [ ] `visible` uses the **locally clamped** position — `min(shared position, max(0, content − pane))` from this Gantt's own extents (Q-B)
- [ ] `batch(run)` — re-entrant, flushes in `finally`; ships ahead of its S1.9 caller, deliberately (D-S1.7-10)
- [ ] Not exported from `api/` (D-S1.7-10)
- [ ] Tests per §6: one `onChange` per change; local clamp; `unbind` detaches both; a throwing `run` still flushes

### Phase 6 — `view/` + `render/` wiring (S1.7 §3.6, §3.7)
- [ ] `ScrollBindingHandle.setContent`/`setPane` → `setContentSize`/`setPaneSize` (§3.8 A — fields keep `content`/`pane`)
- [ ] `attachScroll(element, viewport)` → `{ writePosition, detach }`; binding, reaction, `mine()` and both setters removed; the echo target becomes `viewport.visible`
- [ ] `GanttShell` — construct `Viewport`, hold **one** handle and **one** reaction; `render()` ends `sync()` → `setContentSize()` → `writePosition()` (D-S1.5-7, now visible in the shell)
- [ ] `GanttShell` — `#scrollAttachment` stops being `| undefined`; delete the five-line construction-order comment and the `?.` guards
- [ ] `GanttShell` — drop **both** gutter adjustments (D-S1.7-3): `#contentSize` loses `rowLabelWidth`, `setPaneSize` takes `{ drawableWidth, clientHeight }`
- [ ] `render/dom` — nested keyed sync for bands (bands keyed by index, ticks keyed within a band); ticks sized by `width`; harness CSS and any affected e2e selector follow (Q-A)
- [ ] Tests per §6 (dom + the extended `e2e/scroll-sync.spec.ts` pinned-chart case)

### Phase 7 — S1.7b, pane-size attachment (#8)
> Included because it is numbered 1.7b. It is a separate commit and can be cut without touching anything above — say so and Phase 8's acceptance drops U5's resize half.
- [ ] `src/view/pane-size-attachment.ts` — `attachPaneSize(host, onPaneSize, ResizeObserverCtor = ResizeObserver): PaneSizeAttachment`
- [ ] One observer per Gantt, content-box, coalescing several entries in one tick to the last box; **no deduping** — notify-iff-changed is the models' contract (D-S1.5-4)
- [ ] Wire to `ViewportHandle.setPaneSize()` and nothing else; `GanttShell.destroy()` detaches
- [ ] Give `#readMetrics`/`#rowHeight` the explicit invalidation path #49 deferred here
- [ ] Test (dom, injected fake `ResizeObserver`): one resize reaches both models; no second observer; `detach()` unhooks
- [ ] Test (e2e): resizing the window re-fits the axis — the literal #8 repro
- [ ] Close #8

### Phase 8 — Ledger, spec edits, acceptance
- [ ] Run each retired spelling as a grep, expect **zero**: `setContent(` · `setPane(` · `\.viewport\b` in `layout/`+`render/`+`view/` · `header.ticks` · `ticks(preset` · `DatasetLike`
- [ ] Prose sites that keep the word but change the term: `src/render/backend.ts:26` ("viewport width" → pane width), `src/view/gantt-shell.test.ts:144` and `e2e/harness.spec.ts:21` (regression titles naming history → "the culling window's `y`")
- [ ] The §7 spec edits, landed **with** the step: `plans/01` §4 and §8.2, `plans/01` §1.1 + `CLAUDE.md`, `plans/s1.5-scroll-model/README.md` (the S1.8→S1.7 `Viewport` pointers and the superseded blocks), `docs/adr/0004`, `docs/02` §5, `docs/01` §I12, `CONTEXT.md` (**Viewport**, **Visible**, **Overscan**, **Header band**; edit **TimeScale**'s _Avoid_ line and **Dataset**; **Tick** gains its cell width)
- [ ] Review `harness/main.ts` against the library rules — every commit, changed or not (CLAUDE.md). Record any gap against S1.7 and fix it in `src/`
- [ ] Acceptance U1–U6 per S1.7 §8

---

## 5. What is explicitly **not** in this plan

| Deferred | Returns at |
|---|---|
| `gantt.reveal(entryId)`; `gantt.scale =` / `gantt.scroll =` / `gantt.overscan` setters | S1.8 |
| The row-label gutter leaving the scrollable content (the x-axis defect under D-S1.7-11) | S1.8 |
| Horizontal scroll that is actually non-zero — `TimeScaleIntent.zoom`, anchored zoom (D-F′) | S1.9 |
| Multi-band presets, band heights, sticky header; gridlines | S1.9 / S1.10 |
| `--fg-*` parts vocabulary, harness styling tokens instead of class names (#41's remaining half) | S1.10 |
| 5,000-entry fixture, the two-Gantt D9 demo, an S1 checklist in `scripts/slice-gate.mjs`, ticking `plans/03` S1 acceptance | S1.11 |
| Entry-list reactivity (#33) | S2 |
| Resolve hook / scheduling plugin (#15, #16) | S3 |

Horizontal culling ships in `layout/` and is unit-tested, but has **no live caller** until S1.9 gives `contentWidth` a reason to exceed the pane. That is D-S1.7-11 and it is intended, not dead code.

---

## 6. Definition of done for "up to and including S1.7"

1. Issue #1's S1.5 and S1.7 boxes ticked; #9, #54 and #8 closed; #41 reduced to its live half.
2. `pnpm verify` green, and `pnpm test:e2e` green including the new pinned-chart and resize cases.
3. Every grep in Phase 8's ledger returns zero results.
4. `GanttShell` holds one handle and one reaction, and no file in `view/` is over ~150 lines (R1's soft cap).
5. The §7 spec edits are in the same commits as the code they describe — not deferred to the issue thread.
