# S1.9 — Presets hour→year, multi-band headers, anchored zoom

**Slice:** S1 (`plans/03` §S1) · **Step:** S1.9 · **Issue:** #1
**Governed by:** [S1 API conventions](https://github.com/Pawel-IT/FreeGantt/issues/1#issuecomment-5400465734) — and **D-F′**, which this step is the first to make observable.
**Source:** the [S1.9 issue comment](https://github.com/Pawel-IT/FreeGantt/issues/1#issuecomment-5400111232).

> **This file is a stub.** It holds only the items that earlier steps handed to S1.9. It is **not** the settled spec, and nothing here is a decision. Write the full spec — scope calls, `D-S1.9-n` decisions, API, tests, TODO, deferrals — before S1.9 code starts, in the form of [`plans/s1.7-windowed-frame/README.md`](../s1.7-windowed-frame/README.md), from the issue comment plus §0 below.

---

## 0. Carried in — do not lose these

Each row was deferred by a step that has closed. The step that deferred it, and the reason it could not land earlier, are named so the next author does not re-derive either.

| Carried item | From | Why it waited | What it needs here |
|---|---|---|---|
| `gantt.reveal(entryId)` | S1.7 §9 → S1.8 §0 Q1 | `reveal` brings a bar into view on **both** axes. Its x half is a no-op while `contentWidth ≡ paneWidth`, so it would ship half-written. | `zoom`, which is what makes a horizontal scroll range exist |
| `gantt.overscan` | S1.7 §4 and §9 → S1.8 §0 Q2 | S1.7 made `overscan` live on `Viewport` and left the public key unset. S1.8 adds only `gridWidth`, so the public-surface pass happens once. | the live-key pass, beside `preset`, `range` and `zoom` |
| A horizontal scroll range that is not `0` | S1.7 §9, D-S1.7-11 | `range: 'fitDataset'` fits `pxPerMs` to the pane, so `max.x ≡ 0` and S1.7's horizontal culling has no live caller. | `TimeScaleIntent.zoom`, which is the first key that makes content wider than the pane |
| Multi-band presets and band heights | S1.7 §9, D-S1.7-6 | `FrameHeader.bands` shipped with one band, so the seam changed once instead of twice. | the two-band presets as data; no seam change |
| `gantt.scale =` / `gantt.scroll =` | S1.7 §9 → S1.8 §0 Q2 | **Cut, not deferred.** `Gantt` never re-exposes its models, or one key gets two write paths (`plans/02` §1.1). Recorded here only so it is not re-derived as missing work. | nothing — it does not land |

Two more things this step inherits, both already stated in the S1.9 issue comment and repeated here because they are easy to miss:

- **D-F′ governs.** `range` is the content span; the visible slice is `[scroll.x, scroll.x + paneWidth]`. Anchored zoom writes `scale.zoom` and `scroll.x` inside one batch and never rewrites `range.start`. It supersedes locked decision D-F, and issue #1 §2 still needs that edit.
- **The defaults cannot exercise the horizontal window.** `fitDataset` + `fitViewport` makes the content exactly as wide as the pane. `zoom: 'preset'` is what the 5,000-entry harness page and `[S1-A1]` run at (S1.11), so the horizontal culling S1.7 shipped gets a live caller.

---

## 1. TODO

- [ ] Write this spec in full, then delete this line and this section's stub note.
