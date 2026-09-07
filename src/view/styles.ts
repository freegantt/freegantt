// view/ — the base stylesheet (plans/s1.10-theming-and-a11y/README.md D-S1.10-6, D-S1.10-8, D-S1.10-9).
// `ensureBaseStyles` is the only place the library writes a stylesheet. Idempotent per document via a
// `<style data-freegantt-styles>` marker: the DOCUMENT holds the state, not a module variable, so two
// Gantt instances in one document share one injected sheet without this being I2's kind of module-level
// singleton (I2 governs shared *mutable state* — configuration, subscriptions, caches that would let two
// instances see each other's changes; an idempotent one-time DOM write guarded by a marker attribute is
// not that — the second Gantt's call is a no-op precisely because the marker makes it safe to call twice,
// and no state is shared, exchanged, or capable of drifting between instances).
//
// Structural rules absorb every inline write pane-layout.ts/render/dom used to make (D-S1.10-6) — the
// new `freegantt/no-inline-style-outside-geometry` lint rule leaves `transform`/`width`/`height` as the
// only properties still legitimately written inline.
//
// The colour defaults are a cool, blue-shifted drawing-sheet palette: a white chart sheet on a light
// grey ground, and a deep indigo-slate in the dark theme. They replace the warm cream set D-S1.10-9
// first shipped. Two reasons. The warm ground clashed with any app shell that is not also warm, and a
// library's defaults have to sit inside somebody else's page. And the old --fg-selection-color was a
// red within a few degrees of --fg-date-line-color, so a selected row and a date line were the same
// paint — the selection is violet now, a hue nothing else in the sheet claims. Colour carries meaning
// here and each meaning gets its own hue: blue is data, vermilion marks time, amber warns, violet is
// what the user picked.
//
// Theme tokens live on `.fg-container`. `theme: 'light'|'dark'` writes `data-fg-theme` on that
// container, not on `:root`. A `:root:not([data-fg-theme])` media query never sees the pin, so Light
// would leave the Gantt on the system dark tokens. `.fg-container[data-fg-theme='light']` always wins.

import { DEFAULT_TICK_BOX_FLOOR_PX, DEFAULT_DIAMOND_SIZE_PX } from '../layout/index.js';

const MARKER_ATTR = 'data-freegantt-styles';

const LIGHT_COLOR_TOKENS = `
  --fg-pane-bg: #FFFFFF;
  --fg-splitter-color: #DDE2E9;
  --fg-header-bg: #EEF1F5;
  --fg-header-band-bg: #FFFFFF;
  --fg-header-text: #16191F;
  --fg-header-subtext: #79828F;
  --fg-header-divider-color: #DDE2E9;
  --fg-row-even-bg: transparent;
  --fg-row-odd-bg: rgba(22, 25, 31, 0.03);
  --fg-row-label-color: #16191F;
  --fg-row-unmatched-label-color: #79828F;
  --fg-bar-fill: oklch(0.52 0.14 248);
  --fg-bar-label-color: #FFFFFF;
  --fg-warn: #B4690E;
  --fg-date-line-color: #CF3B26;
  /* Distinct hue from --fg-bar-fill (S3, D-S3-7): the same colour as the bar's own fill would make the
     selection outline invisible against it. It must also stay clear of --fg-date-line-color and
     --fg-warn, which is what the old hue-25 red failed — it landed within a few degrees of the date
     line's own red, so a selected row and an error read as the same paint. Violet is unclaimed by
     any other meaning in the sheet: nothing else on the chart is this hue, so it says "picked" and
     nothing else. */
  --fg-selection-color: oklch(0.55 0.20 305);
  --fg-popup-bg: #FFFFFF;
  --fg-popup-border: #DDE2E9;
  --fg-popup-shadow: 0 1px 2px rgba(22, 25, 31, 0.1), 0 8px 24px -6px rgba(22, 25, 31, 0.22);
`.trimEnd();

const DARK_COLOR_TOKENS = `
  --fg-pane-bg: #171B22;
  --fg-splitter-color: #262C36;
  --fg-header-bg: #12161C;
  --fg-header-band-bg: #171B22;
  --fg-header-text: #E8ECF3;
  --fg-header-subtext: #6D7889;
  --fg-header-divider-color: #262C36;
  --fg-row-even-bg: transparent;
  --fg-row-odd-bg: rgba(232, 236, 243, 0.04);
  --fg-row-label-color: #E8ECF3;
  --fg-row-unmatched-label-color: #6D7889;
  --fg-bar-fill: oklch(0.74 0.13 248);
  --fg-bar-label-color: #10131A;
  --fg-warn: #E0A340;
  --fg-date-line-color: #FF6F57;
  --fg-selection-color: oklch(0.76 0.17 305);
  --fg-popup-bg: #1B2029;
  --fg-popup-border: #313846;
  --fg-popup-shadow: 0 1px 2px rgba(0, 0, 0, 0.4), 0 8px 24px -6px rgba(0, 0, 0, 0.6);
`.trimEnd();

const BASE_STYLESHEET = `
:root {
${LIGHT_COLOR_TOKENS}
}
.fg-container {
${LIGHT_COLOR_TOKENS}
  --fg-indent-width: 12px;
  --fg-lane-gap: 2px;
  --fg-bar-opacity: 0.9;
}
@media (prefers-color-scheme: dark) {
  .fg-container:not([data-fg-theme]) {
${DARK_COLOR_TOKENS}
  }
}
.fg-container[data-fg-theme='light'] {
${LIGHT_COLOR_TOKENS}
}
.fg-container[data-fg-theme='dark'] {
${DARK_COLOR_TOKENS}
}

/* S3.1: a click selects an Entry. Native text highlight on a bar or row label is a different
   action and it also lets a double-click take text from outside the Gantt. S5's editor overlay
   sets user-select: text on the editor itself. */
/* position: relative so .fg-overlay's inset: 0 (below) anchors to the container's own box, not an
   outer one — the container had no positioned ancestor of its own to need before S5.3. */
.fg-container { display: flex; overflow: hidden; user-select: none; position: relative; }
/* D-S1.8-13, #126: horizontal is a real, independent native scroller — vertical stays hidden here
   and transform-driven (.fg-rows-clip below owns that clip; D-S1.8-1 unchanged for that axis). */
.fg-grid-pane { display: flex; flex-direction: column; flex-shrink: 0; overflow-x: auto; overflow-y: hidden; background: var(--fg-pane-bg); }
/* S1.12, D-S1.12-9: mirrors .fg-header's own band stack — one .fg-band per header band
   (setHeaderBandCount), sized from the same --fg-band-height expression.
   width: --fg-grid-content-width (D-S1.8-13, #126) — falls back to 100% (today's layout, unchanged)
   and only widens past the pane when fixed-width columns overflow it (PaneLayout#contentWidth). */
.fg-grid-spacer { flex-shrink: 0; display: flex; flex-direction: column; position: relative; width: var(--fg-grid-content-width, 100%); }
.fg-grid-header { position: absolute; inset: 0; display: flex; align-items: stretch; z-index: 1; color: var(--fg-row-label-color); }
/* position: relative so .fg-column-resizer (below) anchors to this cell's own box, not the header row's. */
/* --fg-cell-padding-inline/-block: the one pair of tokens both a header cell and a row cell read, so
   grid text never sits flush against a column's own edge or its neighbour's. */
.fg-col-header { display: flex; align-items: center; min-width: 0; overflow: hidden; box-sizing: border-box; flex: var(--fg-col-flex, 1) 1 0; position: relative; cursor: pointer; padding-inline: var(--fg-cell-padding-inline, 8px); padding-block: var(--fg-cell-padding-block, 4px); }
/* #139: every column is fixed by default — data-fixed is the common case now, not the exception.
   --fg-column-width (default 120, read by ColumnChrome, no rule of its own here — same posture
   --fg-column-min-width takes) sets the width a column falls back to when neither this Gantt's own
   column nor its Field names one. The flex path above stays for a column that asks to flex. */
.fg-col-header[data-fixed] { flex: 0 0 auto; }
.fg-col-header[data-align='end'] { justify-content: flex-end; text-align: end; }
.fg-col-header[data-align='center'] { justify-content: center; text-align: center; }
/* S5.7, D-S5-18: a fixed/pinned column's cursor stays a plain pointer — no resize/reorder affordance
   to promise. */
.fg-col-header[data-movable-off] { cursor: default; }
.fg-col-header-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1 1 auto; }
/* S5.7, D-S5-18: the resize grip. 6px wide visually; --fg-column-resizer-hit (default 12px, via the
   ::before overlay below) widens only the pointer hit target, so adjacent cells' text never loses
   space to it. --fg-column-min-width (default 40, read by GanttShell, no rule of its own here — same
   posture --fg-splitter-width/--fg-grid-pane-width already take) floors how far a drag can shrink the
   column it grips. */
.fg-column-resizer { position: absolute; top: 0; right: 0; height: 100%; width: 6px; cursor: col-resize; touch-action: none; }
/* A resting divider line marks the grip before the pointer ever reaches it; hover/focus swaps in the
   splitter's own colour and widens the line so the drag target reads as clearly as .fg-splitter does. */
.fg-column-resizer::after { content: ''; position: absolute; inset-block: 0; right: 2px; width: 1px; background: var(--fg-header-divider-color); }
.fg-column-resizer:hover::after { right: 1px; width: 3px; background: var(--fg-splitter-color); }
.fg-column-resizer::before { content: ''; position: absolute; inset-block: 0; left: 50%; width: var(--fg-column-resizer-hit, 12px); transform: translateX(-50%); }
.fg-col-header[data-resizable-off] .fg-column-resizer { display: none; }
/* S5.7, D-S5-18: the reorder drop indicator — an inset border on the edge a drop would land against,
   painted on the target header cell rather than a floating element (render/dom/index.ts's own
   data-drop attribute, "before" or "after"). */
.fg-col-header[data-drop='before'] { box-shadow: inset 2px 0 0 0 var(--fg-selection-color); }
.fg-col-header[data-drop='after'] { box-shadow: inset -2px 0 0 0 var(--fg-selection-color); }
/* S5.7, D-S5-18: the grabbed header cell during a reorder drag — it rides a translateX written by
   render/dom/index.ts (a transform only, so it keeps its slot in the flow and no neighbour reflows).
   z-index and --fg-popup-shadow (the same lifted-surface token .fg-popup uses) raise it over its
   neighbours, and a --fg-header-bg wash gives it a panel of its own to read as one carried cell.
   The wash stays part transparent on purpose: the drop indicator is painted on the target cell
   *under* this one, and the pointer sits over that target for most of a drag — an opaque cell hides
   the very line that says where the column lands. */
.fg-col-header[data-dragging] { z-index: 2; cursor: grabbing; background: color-mix(in srgb, var(--fg-header-bg) 55%, transparent); box-shadow: var(--fg-popup-shadow); }
.fg-rows-clip { position: relative; flex: 1 1 auto; overflow: hidden; width: var(--fg-grid-content-width, 100%); }
.fg-rows { position: relative; height: 100%; }
.fg-splitter { flex-shrink: 0; cursor: col-resize; background: var(--fg-splitter-color); }
.fg-timeline-pane { position: relative; flex: 1 1 auto; min-width: 0; overflow: auto; background: var(--fg-pane-bg); }
/* S1.12, D-S1.12-9/D-S1.12-15: height comes from band count × one band height, not a fixed total
   split N ways — and it stays pinned to the top of the timeline pane while rows scroll under it
   (closes the S1.8 debt, D-S1.12-15). */
.fg-header { background: var(--fg-header-bg); position: sticky; top: 0; z-index: 1; display: flex; flex-direction: column; height: auto; overflow: hidden; }
.fg-band { background: var(--fg-header-band-bg); color: var(--fg-header-text); border-bottom: 1px solid var(--fg-header-divider-color); position: relative; flex: 0 0 var(--fg-band-height, 20px); min-height: 0; }
/* padding/overflow are structural, not typography (D-S1.10-6/D-S1.11-8 leave font-size/family to the
   consumer): a tick's box is exactly its own width, so a label that would collide with its neighbour
   clips with an ellipsis instead of overflowing and garbling both (S1.12 header readability follow-up).
   border-left marks each tick's own cell boundary so adjacent ticks in the same band read as
   separate columns, matching .fg-band's existing border-bottom between bands.
   --fg-tick-box-floor is the Tick box floor (CONTEXT.md): padding-inline derives from it so the
   CSS box and layout's clamp input stay one Token. The 1px in the calc is this rule's border-left. */
.fg-tick { color: var(--fg-header-subtext); position: absolute; top: 0; left: 0; height: var(--fg-band-height, 20px); line-height: var(--fg-band-height, 20px); box-sizing: border-box; padding: 0 calc((var(--fg-tick-box-floor, ${DEFAULT_TICK_BOX_FLOOR_PX}px) - 1px) / 2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; border-left: 1px solid var(--fg-header-divider-color); }
.fg-row { background: var(--fg-row-even-bg); position: absolute; top: 0; left: 0; width: 100%; display: flex; align-items: stretch; --fg-row-depth: 0; }
/* Row parity comes from the frame's absolute row index (render/dom's rowParity), stamped as
   data-parity — not from :nth-child, which counts only the windowed rows and slides the whole zebra
   out of phase as soon as the pane scrolls. .fg-row-band is the timeline pane's copy of the same
   paint, from the same FrameRow, so the two panes stripe the same rows in both themes. */
.fg-row[data-parity='odd'], .fg-row-band[data-parity='odd'] { background: var(--fg-row-odd-bg); }
.fg-row[data-parity='even'], .fg-row-band[data-parity='even'] { background: var(--fg-row-even-bg); }
.fg-row-bands { position: relative; }
.fg-row-band { position: absolute; top: 0; left: 0; width: 100%; pointer-events: none; }
.fg-row-label, .fg-row-cell { color: var(--fg-row-label-color); display: flex; align-items: center; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; box-sizing: border-box; flex: var(--fg-col-flex, 1) 1 0; padding-inline-end: var(--fg-cell-padding-inline, 8px); padding-block: var(--fg-cell-padding-block, 4px); }
.fg-row[data-matched='false'] .fg-row-label, .fg-row[data-matched='false'] .fg-row-cell { color: var(--fg-row-unmatched-label-color); }
/* Bug hunt (S5 fixes): a grid row's own selection paint (CONTEXT.md Parts/State) — a background, not
   an outline (an outline would fight the row's cell layout the way .fg-bar's never has to). Same
   --fg-selection-color Token .fg-bar[data-state~="selected"] already uses, so a bar click and its
   matching row read as one selection, not two colours. */
.fg-row[data-state~='selected'] { background: color-mix(in oklab, var(--fg-selection-color) 16%, transparent); }
.fg-row-cell { padding-inline-start: var(--fg-cell-padding-inline, 8px); }
.fg-row-label { padding-inline-start: calc(var(--fg-row-depth, 0) * var(--fg-indent-width, 12px) + var(--fg-cell-padding-inline, 8px)); }
.fg-row-label-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.fg-row-twisty { flex: 0 0 var(--fg-indent-width, 12px); width: var(--fg-indent-width, 12px); border: 0; background: transparent; padding: 0; cursor: pointer; color: inherit; }
.fg-row-twisty::before { content: '▸'; }
.fg-row-twisty[aria-expanded='true']::before { content: '▾'; }
.fg-row-label[data-fixed], .fg-row-cell[data-fixed] { flex: 0 0 auto; }
.fg-row-label[data-align='end'], .fg-row-cell[data-align='end'] { justify-content: flex-end; text-align: end; }
.fg-row-label[data-align='center'], .fg-row-cell[data-align='center'] { justify-content: center; text-align: center; }
/* S5.6, D-S5-15: registered decoration providers' own layers — one mounted below .fg-bars, one
   above. DOM order alone gives the paint order (no z-index needed against .fg-bars either). */
.fg-decorations-under, .fg-decorations-over { position: relative; }
.fg-range-band { position: absolute; top: 0; left: 0; pointer-events: none; }
.fg-row-stripe { position: absolute; left: 0; width: 100%; pointer-events: none; }
.fg-bars { position: relative; }
/* D-S3-21: touch-action: none on the bar itself, not just the resize handles — a touch drag must
   never fight the browser's own pan/scroll gesture over the same surface. */
/* T1-1: the colour-mix lives on the bar itself, not .fg-container — a renderer's own
   --fg-bar-fill override (set on this element, e.g. by barRenderer) only reaches the painted
   colour if the mix reads --fg-bar-fill at this element too. --fg-bar-opacity stays declared on
   .fg-container alone and inherits down unchanged. */
.fg-bar { --fg-bar-fill-painted: color-mix(in oklch, var(--fg-bar-fill) calc(var(--fg-bar-opacity) * 100%), transparent); background: var(--fg-bar-fill-painted); color: var(--fg-bar-label-color); border-radius: var(--fg-bar-radius, 3px); position: absolute; top: 0; left: 0; touch-action: none; }
.fg-bar-bracket { background: transparent; border: 2px solid var(--fg-bar-fill-painted); border-bottom: none; border-radius: 2px 2px 0 0; color: var(--fg-bar-fill-painted); }
/* Bug hunt (S5 fixes): a milestone's painted span is floored and centred on the instant by
   barSpan (layout/frame.ts) so the rotated diamond — and the selection outline on .fg-bar itself
   — both fit inside the bar box. --fg-diamond-size is the one Token layout's floor and this glyph's
   own size share (CONTEXT.md), read the same way as --fg-tick-box-floor. */
.fg-bar-diamond { background: transparent; overflow: visible; color: transparent; }
.fg-bar-diamond::before { content: ''; position: absolute; top: 50%; left: 50%; width: var(--fg-diamond-size, ${DEFAULT_DIAMOND_SIZE_PX}px); height: var(--fg-diamond-size, ${DEFAULT_DIAMOND_SIZE_PX}px); background: var(--fg-bar-fill-painted); transform: translate(-50%, -50%) rotate(45deg); }
.fg-bar[data-flag~="conflict"] { outline: 2px solid var(--fg-warn); }
/* D-S3-7: data-state is a fixed five-token projection of InteractionState, painted once here — not a
   per-bar modifier class (CONTEXT.md's State attribute entry). 'hovered' has no rule of its own yet
   (S3.2 adds the grab cursor it pairs with); the token still paints so a consumer's own selector can
   already key off it. */
.fg-bar[data-state~="selected"] { outline: 2px solid var(--fg-selection-color); }
/* S3.5, D-S3-17: an unsettled beforeEntryMove/beforeEntryResize Promise holds the bar here. Selected
   uses 2px solid; pending uses 2px dotted of the same token so the two read apart. */
.fg-bar[data-state~="pending"] { opacity: var(--fg-pending-opacity, 0.6); outline: 2px dotted var(--fg-selection-color); }
/* S3.6, D-S3-18, U7: an installed extension hook's own preview extra (ItemPreview.extra) — a second
   bar the caller never grabbed, moved by the hook's own cascade. 'dragging' (the caller's own grabbed
   bar, ItemPreview.extra: false) paints no rule of its own yet, same as 'hovered' above. */
.fg-bar[data-state~="ghost"] { opacity: var(--fg-ghost-opacity, 0.4); pointer-events: none; }
/* D-S3-6: movableItemId's cursor is a boolean attribute, not an inline style — cursor is not one of
   the geometry properties no-inline-style-outside-geometry allows inline. */
.fg-bar[data-movable] { cursor: grab; }
/* D-S3-8: one shared pair of handle nodes, moved onto the resizable bar's edges by applyState rather
   than one pair per bar. Parked with the hidden DOM property (render/dom/index.ts), which the UA's
   own [hidden] { display: none } default already covers. */
.fg-bar-handle { position: absolute; top: 0; left: -4px; width: 8px; cursor: ew-resize; touch-action: none; z-index: 1; }
/* In flow, below the sticky header — the same origin .fg-bars and .fg-row-bands sit at. Absolute at
   the pane's own top-left instead, the sizer declared a scroll extent one header short of where the
   content it sizes actually ends, and the last row could never scroll fully into view. */
.fg-content-sizer { position: relative; width: 1px; height: 1px; visibility: hidden; }
/* height is set inline per frame (render/dom/date-line.ts), not bottom: 0: .fg-timeline-pane is both
   this element's positioned ancestor and its own overflow: auto scroll container, so bottom: 0
   would resolve against the pane's visible clientHeight and cut the line off at the first
   screenful instead of running the full scrollable row content. */
.fg-date-line { position: absolute; top: 0; border-left: 1px solid var(--fg-date-line-color); pointer-events: none; }
.fg-date-line-label { position: absolute; left: 0; top: 0; white-space: nowrap; color: var(--fg-date-line-color); }
/* S3.8, D-S3-15: hot-path Cursor line — same stroke token as Date lines, never a frame decoration. */
.fg-cursor-line { position: absolute; top: 0; z-index: 2; border-left: 1px solid var(--fg-date-line-color); pointer-events: none; }
.fg-cursor-line-label { position: absolute; left: 0; top: 0; z-index: 2; white-space: nowrap; color: var(--fg-date-line-color); pointer-events: none; }
/* S5.3, D-S5-8: the one overlay layer, above both panes (DOM order alone gives it the top of the
   stack — no z-index needed against them). pointer-events: none so an empty overlay never blocks the
   panes underneath; a mounted .fg-popup opts back in. */
.fg-overlay { position: absolute; inset: 0; pointer-events: none; overflow: visible; }
/* overflow: hidden so a menu item's own hover paint clips to this radius instead of squaring off
   the first and last corners. */
.fg-popup { position: absolute; top: 0; left: 0; pointer-events: auto; background: var(--fg-popup-bg); border: 1px solid var(--fg-popup-border); box-shadow: var(--fg-popup-shadow); border-radius: 6px; overflow: hidden; }
/* S5.5, D-S5-13: tooltips()'s own content, mounted inside .fg-popup. */
.fg-tooltip { padding: 7px 10px; font: inherit; line-height: 1.45; max-width: 280px; }
.fg-tooltip-title { font-weight: 600; }
.fg-tooltip-dates { color: var(--fg-header-subtext); font-size: 0.9em; font-variant-numeric: tabular-nums; }
/* S5.5, D-S5-14: contextMenu()'s own content, mounted inside .fg-popup. */
.fg-menu { padding: 5px; min-width: 184px; }
/* The item is inset from the menu's own padding box so its hover paint is a rounded row floating
   inside the popup, not a band running edge to edge. Full-bleed hover fights the popup's radius at
   the first and last item, which is why every considered menu insets it. */
.fg-menu-item { display: block; width: 100%; box-sizing: border-box; padding: 5px 9px; border: none; border-radius: 4px; background: none; text-align: start; font: inherit; line-height: 1.45; color: inherit; cursor: pointer; white-space: nowrap; }
/* --fg-row-odd-bg is a 3%-alpha zebra stripe — at that strength a hovered item was not visibly
   hovered. The bar fill is the sheet's own "this is live data" hue, so a wash of it reads as
   pointer feedback without introducing a colour the sheet does not already use. */
.fg-menu-item:hover, .fg-menu-item:focus { background: color-mix(in oklab, var(--fg-bar-fill) 14%, transparent); outline: none; }
.fg-menu-item:active { background: color-mix(in oklab, var(--fg-bar-fill) 22%, transparent); }
.fg-menu-separator { height: 1px; margin: 5px 4px; background: var(--fg-header-divider-color); }
/* S5.8, D-S5-19: inlineEditing()'s own control — mounted through the overlay layer directly (not
   wrapped in .fg-popup: the cell editor has no flip/clamp, it always sits at the cell's own rect,
   Popup's own file header explains why it is built differently). data-state="invalid" is a failed
   parseValue, a beforeChange veto, or the default dateInput's non-midnight refusal (issue #137 F11/F12). */
.fg-cell-editor { position: absolute; top: 0; left: 0; pointer-events: auto; box-sizing: border-box; }
/* The ring is the affordance: a 1px border alone reads as a table cell, and the open editor has to
   read as the one live control on the chart. It uses the Selection token because an open editor IS
   the selection, expressed as a field — which is also why that token had to stop being red. */
.fg-cell-editor-control { width: 100%; height: 100%; box-sizing: border-box; font: inherit; padding-inline: var(--fg-cell-padding-inline, 8px); border: 1px solid var(--fg-selection-color); border-radius: 3px; outline: none; background: var(--fg-pane-bg); color: var(--fg-row-label-color); box-shadow: 0 0 0 3px color-mix(in oklab, var(--fg-selection-color) 20%, transparent); }
/* Invalid swaps the whole ring, not only the border colour, so the state is legible at a glance and
   not just to a reader comparing two 1px lines. */
.fg-cell-editor[data-state='invalid'] .fg-cell-editor-control { border-color: var(--fg-warn); box-shadow: 0 0 0 3px color-mix(in oklab, var(--fg-warn) 22%, transparent); padding-inline-end: 22px; }
/* #160, D-S5-47: the invalid editor's own discard button, laid over the control's own end edge —
   .fg-cell-editor already establishes the positioning context. It comes after the control in the
   markup, so it paints on top with no z-index. Not a .fg-cell-editor-control, so the rule above never
   reaches it. */
.fg-cell-editor-discard { position: absolute; top: 50%; right: 2px; transform: translateY(-50%); width: 18px; height: 18px; padding: 0; border: none; border-radius: 3px; background: none; font: inherit; line-height: 1; color: var(--fg-warn); cursor: pointer; }
.fg-cell-editor-discard:hover, .fg-cell-editor-discard:focus-visible { background: color-mix(in oklab, var(--fg-warn) 18%, transparent); outline: none; }
/* The Refusal notice (#171): words over the cell that could not open an editor. It is its own class
   and not a .fg-cell-editor (#231 F1) — a refused *commit* stamps data-reason on the open editor too
   (#160, D-S5-47), so the attribute alone stopped telling the two apart, and the :not(:has(...)) that
   stood in here reached the wrong node the moment a consumer copied the selector by hand.
   pointer-events: none is load-bearing — the notice sits over the cell, and the next double-click must
   reach the cell. It is also why the split matters: an editor styled by this rule would lose its own
   control and its discard button to the same declaration.
   S5.12, D-S5-40: data-reason holds the kebab-case Error report code. This rule matches the attribute
   and never one of its values, so a rename reaches no selector here. A consumer styling one reason
   writes [data-reason='derived-value'], which is also the code they read off the report. */
.fg-cell-notice { position: absolute; top: 0; left: 0; box-sizing: border-box; pointer-events: none; display: flex; align-items: center; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font: inherit; padding-inline: var(--fg-cell-padding-inline, 8px); border: 1px solid var(--fg-warn); background: var(--fg-pane-bg); color: var(--fg-warn); }
`.trim();

/** Injects the library's base stylesheet into `doc` exactly once. Safe to call from every Gantt
 * instance mounted in that document — the second and later calls are a no-op. */
export function ensureBaseStyles(doc: Document): void {
  if (doc.head.querySelector(`style[${MARKER_ATTR}]`)) return;
  const style = doc.createElement('style');
  style.setAttribute(MARKER_ATTR, '');
  style.textContent = BASE_STYLESHEET;
  doc.head.append(style);
}
