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
// only properties still legitimately written inline. Colour token defaults are D-S1.10-9's: pulled from
// an existing, non-shipping palette this team maintains elsewhere — only the values cross over, per
// CLAUDE.md's "vendor Gantt product names never appear in specs, docs, or code".
//
// Theme tokens live on `.fg-container`. `theme: 'light'|'dark'` writes `data-fg-theme` on that
// container, not on `:root`. A `:root:not([data-fg-theme])` media query never sees the pin, so Light
// would leave the Gantt on the system dark tokens. `.fg-container[data-fg-theme='light']` always wins.

import { DEFAULT_TICK_BOX_FLOOR_PX } from '../layout/index.js';

const MARKER_ATTR = 'data-freegantt-styles';

const LIGHT_COLOR_TOKENS = `
  --fg-pane-bg: #FAFAF7;
  --fg-splitter-color: #E6E2D9;
  --fg-header-bg: #F4F2EC;
  --fg-header-band-bg: #FFFFFF;
  --fg-header-text: #1A1815;
  --fg-header-subtext: #9A958B;
  --fg-header-divider-color: #E6E2D9;
  --fg-row-even-bg: transparent;
  --fg-row-odd-bg: rgba(26, 24, 21, 0.028);
  --fg-row-label-color: #1A1815;
  --fg-row-unmatched-label-color: #9A958B;
  --fg-bar-fill: oklch(0.55 0.13 245);
  --fg-bar-label-color: #FFFFFF;
  --fg-warn: #D97706;
  --fg-date-line-color: #DC2626;
  /* Distinct hue from --fg-bar-fill (S3, D-S3-7): the same colour as the bar's own fill would make the
     selection outline invisible against it. */
  --fg-selection-color: oklch(0.55 0.19 25);
  --fg-popup-bg: #FFFFFF;
  --fg-popup-border: #E6E2D9;
  --fg-popup-shadow: 0 2px 8px rgba(26, 24, 21, 0.16);
`.trimEnd();

const DARK_COLOR_TOKENS = `
  --fg-pane-bg: #15161A;
  --fg-splitter-color: #2B2F36;
  --fg-header-bg: #22252B;
  --fg-header-band-bg: #1B1D22;
  --fg-header-text: #ECEAE3;
  --fg-header-subtext: #6E6A62;
  --fg-header-divider-color: #2B2F36;
  --fg-row-even-bg: transparent;
  --fg-row-odd-bg: rgba(255, 255, 255, 0.032);
  --fg-row-label-color: #ECEAE3;
  --fg-row-unmatched-label-color: #6E6A62;
  --fg-bar-fill: oklch(0.72 0.13 245);
  --fg-bar-label-color: #1A1815;
  --fg-warn: #FBBF24;
  --fg-date-line-color: #F87171;
  --fg-selection-color: oklch(0.75 0.19 25);
  --fg-popup-bg: #1B1D22;
  --fg-popup-border: #2B2F36;
  --fg-popup-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
`.trimEnd();

const BASE_STYLESHEET = `
:root {
${LIGHT_COLOR_TOKENS}
}
.fg-container {
${LIGHT_COLOR_TOKENS}
  --fg-indent-width: 12px;
  --fg-lane-gap: 2px;
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
.fg-row:nth-child(odd) { background: var(--fg-row-odd-bg); }
.fg-row-label, .fg-row-cell { color: var(--fg-row-label-color); display: flex; align-items: center; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; box-sizing: border-box; flex: var(--fg-col-flex, 1) 1 0; padding-inline-end: var(--fg-cell-padding-inline, 8px); padding-block: var(--fg-cell-padding-block, 4px); }
.fg-row[data-matched='false'] .fg-row-label, .fg-row[data-matched='false'] .fg-row-cell { color: var(--fg-row-unmatched-label-color); }
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
.fg-bar { background: var(--fg-bar-fill); color: var(--fg-bar-label-color); border-radius: var(--fg-bar-radius, 3px); position: absolute; top: 0; left: 0; touch-action: none; }
.fg-bar-bracket { background: transparent; border: 2px solid var(--fg-bar-fill); border-bottom: none; border-radius: 2px 2px 0 0; color: var(--fg-bar-fill); }
.fg-bar-diamond { background: transparent; overflow: visible; color: transparent; }
.fg-bar-diamond::before { content: ''; position: absolute; top: 50%; left: 0; width: 10px; height: 10px; background: var(--fg-bar-fill); transform: translate(-50%, -50%) rotate(45deg); }
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
.fg-content-sizer { position: absolute; top: 0; left: 0; width: 1px; height: 1px; visibility: hidden; }
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
.fg-popup { position: absolute; top: 0; left: 0; pointer-events: auto; background: var(--fg-popup-bg); border: 1px solid var(--fg-popup-border); box-shadow: var(--fg-popup-shadow); border-radius: 4px; }
/* S5.5, D-S5-13: tooltips()'s own content, mounted inside .fg-popup. */
.fg-tooltip { padding: 6px 10px; font: inherit; max-width: 280px; }
.fg-tooltip-title { font-weight: 600; }
.fg-tooltip-dates { color: var(--fg-header-subtext); font-size: 0.9em; }
/* S5.5, D-S5-14: contextMenu()'s own content, mounted inside .fg-popup. */
.fg-menu { padding: 4px 0; min-width: 160px; }
.fg-menu-item { display: block; width: 100%; padding: 4px 12px; border: none; background: none; text-align: start; font: inherit; color: inherit; cursor: pointer; white-space: nowrap; }
.fg-menu-item:hover, .fg-menu-item:focus { background: var(--fg-row-odd-bg); outline: none; }
.fg-menu-separator { height: 1px; margin: 4px 0; background: var(--fg-splitter-color); }
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
