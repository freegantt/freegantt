# Branch review — #436 ticks and bars past `contentWidth`

- Branch: `Pawel-IT/issue-436-tick-overflow`
- PR: #454
- Issue: #436
- Diff: `git diff origin/main...HEAD`
- Reviewed: 2026-09-19

## Verdict

The fix has the right idea. It decides membership before the floor and the fixed width, it trims
an `'exact'` box to the content, and it stops the overscan buffer from widening the pane. The e2e
tests and the new harness page prove the range-end milestone case in a real engine.

The fix is not complete. `clampBoxToContent` (`src/layout/frame.ts:160`) moves a box's left edge
but never caps its width. A box wider than `contentWidth` still paints past `contentWidth`. That
is exactly the defect #436 reports. The branch also changes `FrameBar.span`'s meaning without
saying so, makes `reveal()` on an out-of-range entry scroll to the far left, and desyncs the drag
preview from the committed trim. I rate `clampBoxToContent` high. The rest are medium or low.

---

## F1 — A widened or fixed box wider than the content still paints past `contentWidth` (high)

**Files/lines**
- `src/layout/frame.ts:160-163` — `clampBoxToContent`
- `src/layout/frame.ts:129-137` — the `'minimum'` branch
- `src/layout/frame.ts:113-124` — the fixed-box branch

**Problem**
`clampBoxToContent(x, width, contentWidth)` returns `Math.min(Math.max(x, 0), maxX)`, where
`maxX = Math.max(0, contentWidth - width)`. It clamps `x` only. It never returns a width. When
`width > contentWidth`, `maxX` is `0`, so `x` pins to `0` and the box still paints `[0, width)`.
The right edge lands at `width`, which is past `contentWidth`. The doc comment above the function
claims the box "never paints past `[0, contentWidth]`". The claim is false for this case.

The `'minimum'` branch passes `minBarWidthPx` as the width without a content cap
(`src/layout/frame.ts:133`). The fixed-box branch passes the box's own `widthPx`
(`src/layout/frame.ts:124`). Neither branch caps the width at `contentWidth`.

**Concrete failure**
1. `contentWidth = 8`, `minBarWidthPx = 12` (for example `--fg-bar-min-width: 12px` in an 8px
   timeline pane). A zero-length entry at `x = 4` is in content. `centredX = -2`.
   `clampBoxToContent(-2, 12, 8)` returns `0`. The FrameBar is `{x: 0, width: 12}`. Its right
   edge is `12`, which is `4px` past `contentWidth`. `placeFrame` keeps it, because `width > 0`.
2. The same with a fixed box: `diamond(200)` over a range whose `contentWidth` is `100`. The box
   pins to `x = 0` and paints `200px`. The native `scrollWidth` becomes `200`, so the pane
   scrolls natively. `panTo` clamps to the `ScrollAxis` max, and a second Gantt sharing the axis
   never moves. This is the #436 fault again.

No test covers `contentWidth < minBarWidthPx`. No test covers `box.widthPx > contentWidth`.

**Fix**
Cap the returned width at `contentWidth` in both branches. For the `'minimum'` branch, return
`Math.min(minBarWidthPx, contentWidth)`. For the fixed-box branch, return
`Math.min(width, contentWidth)`. Then `clampBoxToContent` may take the capped width, so its
`maxX` can never be negative. Add one test per branch with `contentWidth < width`.

---

## F2 — `span: 'exact'` no longer means "the entry's own span"; the public contract is false (medium)

**Files/lines**
- `src/layout/frame.ts:43-47` — `BarSpanKind`'s doc
- `src/layout/frame.ts:230-238` — `FrameBar.span`'s doc
- `src/layout/frame.ts:138-140` — the `'exact'` return path
- `src/render/dom/index.ts:1189-1192` — the one reader
- `src/api/index.ts:351,356` — the public exports

**Problem**
`clipToContent` trims an `'exact'` box to `[0, contentWidth)`. The trim changes both `x` and
`width`. The kind still says `'exact'`. The two doc comments still say that `'exact'` means "the
entry's own span". That statement is now false for every entry that crosses a content edge.

The one in-tree reader is `render/dom/index.ts:1191`. It deletes `data-span` when the kind is
`'exact'`. A trimmed bar therefore carries no `data-span`, exactly like an untrimmed bar. No DOM
reader can tell a trimmed bar from a whole one. `BarSpanKind` and `FrameBar` are public
(`src/api/index.ts:351,356`), and `BarRendererContext.bar` hands `FrameBar` to a plugin.

**Concrete failure**
A plugin's `barRenderer` reads `ctx.bar.span === 'exact'` and computes the entry's end from
`ctx.bar.x + ctx.bar.width`. For an entry that ends past `range.end`, the computed end is the
content edge (`range.end`), not the entry's real end. The renderer draws a wrong end date, or a
wrong duration. The type tells the author that `'exact'` is the entry's own span, so the author
has no reason to expect the truncation.

**Fix**
Give the trimmed state its own name, for example `'clipped'`, and stamp it as
`data-span="clipped"`. Or keep the geometry trim but expose the entry's own untrimmed extent on
`FrameBar` beside the painted one. In both cases, correct the `BarSpanKind` and `FrameBar.span`
docs.

---

## F3 — `unionSpan` folds a dropped bar's fake `{x: 0, width: 0}` into the union; `reveal()` breaks (medium)

**Files/lines**
- `src/layout/frame.ts:122,130` — the dropped branches return `{x: 0, width: 0}`
- `src/view/gantt-shell.ts:400-413` — `unionSpan`
- `src/view/gantt-shell.ts:2252-2261, 2278-2288` — `reveal` and `#revealEntrySpan`
- `src/layout/viewport/viewport.ts:390-404` — `Viewport.reveal`

**Problem**
`unionSpan` folds every produced Bar through `barSpan`. A dropped bar reports `{x: 0, width: 0}`.
`unionSpan` then computes `minX = Math.min(minX, 0) = 0` and `maxEnd = Math.max(maxEnd, 0)`.
The fabricated `0` pollutes the union. The dropped bar has no painted extent, but it is not
skipped, because `unionSpan` cannot tell "dropped" from "a real box at 0".

`#revealEntrySpan` uses `unionSpan` whenever `bars.length > 0`. `barsForEntry` returns produced
Bars from memory (`src/layout/frame-layout.ts:105-113`), so it still returns the dropped bar.

**Concrete failure**
1. A scrollable axis (a `fit: 'preset'` Gantt, or an explicit range wider than the pane). The user
   scrolls right. The call `gantt.reveal('out-after')` names a single bar entirely past
   `range.end`: `unionSpan` returns `{x: 0, width: 0}`. `Viewport.reveal` sees `target.x < v.x`, so
   it calls `panTo(0)`. The view jumps to the range start. Before the trim, the union named the
   bar's own `x`, so `reveal` scrolled toward the entry and clamped at the range end.
2. A plugin producer draws two Bars for one entry. Bar A is out of content (dropped,
   `{0, 0}`); bar B is in content at `x = 500`. `unionSpan` returns `{x: 0, width: 600}`. `reveal`
   scrolls to `0`, not to `500`.

**Fix**
Skip a dropped bar in `unionSpan`, or make the dropped branches return `undefined` and filter.
The dropped case is already known at the `placeFrame` call site (`src/layout/frame.ts:596`).
Alternatively, let `#revealEntrySpan` fall back to the entry's own dates when every produced Bar
is dropped. Add a test for `reveal` on an entry past `range.end`.

---

## F4 — The drag preview adds true-date deltas to trimmed geometry, so it disagrees with the commit (medium)

**Files/lines**
- `src/render/dom/index.ts:712-720` — `applyBarPreview`
- `src/layout/gesture-draft.ts:182-186` — `previewOffsets`
- `src/layout/frame.ts:138-140` — the trim

**Problem**
`previewOffsets` computes `dx` and `dWidth` against the entry's committed dates
(`gesture-draft.ts:182-185`), not against the painted frame geometry. `applyBarPreview` then adds
those deltas to the committed frame geometry (`geom.x + preview.dx`, `geom.width + preview.dWidth`).
For a trimmed bar the frame geometry is not the entry's true geometry. The delta is therefore
applied to the wrong base.

**Concrete failure**
A bar straddles `range.end`: true `x = 259200`, true width `345600`, painted
`{x: 259200, width: 172800}` (trimmed at `contentWidth = 432000`). The user drags the bar left by
`100px`. `previewOffsets` reports `dx = -100`, `dWidth = 0`. `applyBarPreview` paints
`{x: 259100, width: 172800}`. The correct trimmed preview is
`{x: 259100, width: 172900}` (the true end stays past the edge, so the visible width grows by the
same `100px`). The live bar is `100px` too short. On commit a full frame recomputes the trim and
the bar jumps to the correct size.

For a move to the right, `applyBarPreview` keeps the trimmed width while `x` grows, so the live
preview can paint past `contentWidth` again (transiently) until the frame catches up.

**Fix**
Recompute the trim in the preview, or make `previewOffsets` report the painted base as well as
the entry's dates. The preview must apply the same `clipToContent` rule the commit applies. Add a
test that drags a clipped bar and asserts the preview geometry equals the committed geometry.

---

## F5 — A fixed box whose anchor instant is just outside the content is dropped, while the floored bar path keeps the same entry (low)

**Files/lines**
- `src/layout/frame.ts:121-122` — the anchor-instant membership test
- `src/layout/frame.ts:193-202` — `fixedBoxAnchorX`
- `src/layout/frame.ts:129-137` — the `'minimum'` path, which uses the entry's own extent

**Problem**
A fixed box decides membership on its anchor instant alone. If the anchor instant is outside
`[0, contentWidth]`, the box is dropped, even when the box body overlaps the content. The
floored-bar path for the same entry uses the entry's own extent, so it keeps and clamps the bar.
The two paths disagree.

**Concrete failure**
An entry spans `[-2, 3)` px. `contentWidth = 1000`. A `diamond(13, 'start')` variant draws its
box with its left edge at the anchor instant: the box body is `[-2, 11)`, which overlaps the
content. `fixedBoxAnchorX` returns `-2`, the membership test fails, and the marker is dropped.
The bar path for the same entry (a 5px span, so the floor applies) keeps the entry: `inContent` is
true, `centredX` clamps to `0`, and the bar paints `[0, 12)`. The user sees the bar but not the
diamond.

The near-right case is different: there the drop prevents a right-edge overflow, so the drop is
useful. The near-left case has no overflow benefit; it only hides a visible marker.

**Fix**
Test the box's own extent, not the anchor instant. Keep the box when
`fixedBoxX(...) < contentWidth && fixedBoxX(...) + width > 0`, then clamp. Add a test for
`diamond(13, 'start')` on an entry that starts `2px` left of the content origin.

---

## F6 — `FrameHeaderTick.width` no longer means "to the next boundary" (low)

**Files/lines**
- `src/layout/frame.ts:266-271` — `FrameHeaderTick.width`'s doc
- `src/layout/frame.ts:663-685` — the band-cell clip

**Problem**
The doc says `width` runs "to the next boundary at this band's step". The new clip cuts a cell at
`contentWidth`, so the last cell's `width` is shorter. The doc is now false for that cell.
`FrameHeaderTick` is exported from `layout/index.ts` and used by the render seam. A consumer that
draws a divider at `x + width` draws it at the content edge,
not at the next boundary. That is the intended paint, but the doc no longer matches the data.

The frame-level band clip may also be redundant. `.fg-header-bands` already has
`overflow: hidden` and its width is set to `frame.contentWidth`
(`src/render/dom/index.ts:1318-1326`), so the pane's native `scrollWidth` was already safe from a
band cell. Confirm whether the frame-level clip is needed; if it is not, the added test asserts a
render-side invariant, not a layout one.

**Fix**
Update `FrameHeaderTick.width`'s doc to say "clipped to `contentWidth`". If the frame clip is
redundant, remove it and let the render clip own the bound.

---

## F7 — Harness re-derives day milliseconds with magic numbers (low)

**Files/lines**
- `harness/scroll-sync.ts:83-84`

**Problem**
`paneFitRangeEnd = new Date(paneFitRangeStart.getTime() + 3 * 24 * 60 * 60 * 1000)` hand-rolls a
day in milliseconds. The library publishes `MS` for exactly this. The sibling file added on this
branch uses `MS.DAY` (`harness/entries-outside-the-range.ts`). The API comment at
`src/api/index.ts:409-414` says `MS` exists because `harness/data.ts` hand-rolled
`entry.start + 86400000`. The new code repeats the mistake that comment records.

The comment on the pair also says "one of them carrying a zero-length entry". Both `#pane-fit-a`
and `#pane-fit-b` load `paneFitEntries`, so both carry `pf-d`.

**Concrete failure**
The false "one of them" claim hides which Gantt is supposed to exercise the bug. A later edit can
drop `pf-d` from one dataset and the page still builds, still passes the e2e check, and no longer
demonstrates the case the comment names. The hand-rolled constant teaches the next harness author
the pattern that `MS` exists to replace.

**Fix**
Use `MS.DAY`, as `harness/entries-outside-the-range.ts` does. Correct the comment to say that
both datasets carry the milestone.

---

## Focus 4 — assessment of the golden snapshot and the `contentWidth: Infinity` stubs (no finding)

**Files/lines**
- `src/layout/__snapshots__/frame.test.ts.snap:75` — `entry-3` width `345600 → 172800`
- `src/layout/frame.test.ts:477-490` — the golden snapshot test
- `src/layout/frame.test.ts:49-62` — `wideScale`
- `src/render/dom/index.test.ts:702-707, 738-743` — the `contentWidth: Infinity` stubs

I checked these two changes for a masked regression. I found none.

- The snapshot change is an honest consequence. `entry-3` ends after the test `scale`'s own range,
  so the trim cuts it to the content edge. The new width `172800` is the exact trimmed value for
  that scale. The snapshot pins the trim; it hides nothing.
- The `contentWidth: Infinity` stubs are honest and are commented. The tests check the span-kind
  stamp only, and their `xForInstant` stub is the identity, so a real content bound would drop
  every bar. The stubs opt out of the bound on purpose.

One test-quality note, not a defect. The golden snapshot test still uses the narrow `scale`, while
the branch added `wideScale` for the "one bar per entry" tests for this same reason. The golden
test therefore records a clipped `entry-3` instead of the fixture's normal paint. A reader can
mistake a 4-day entry for a 2-day one. Running this test on `wideScale` would make the golden
record the fixture's real span. This is optional.

---

## What the branch gets right

- It decides membership before the floor and the fixed width (`src/layout/frame.ts:106`).
- It trims an `'exact'` box instead of shifting it, which keeps a straddling bar truthful.
- It clamps the tick query span to `[0, contentWidth]`, so `scale.ticks` stops walking cursors
  the content never needed.
- It clips the header band cells, so no band cell paints past the content.
- `overflow: hidden` on `.fg-bar` is load-bearing for the inside label, and the handles are
  siblings in `barLayer` (`src/render/dom/index.ts:1296`), so the clip cannot reach them.
- The `#pane-fit-a`/`#pane-fit-b` pair and the new e2e tests prove the range-end milestone case in
  a real engine. The argument in the test comment is sound: if neither pane has a native scroll
  range, the shared axis cannot desync.
