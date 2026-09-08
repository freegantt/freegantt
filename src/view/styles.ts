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
// Colour carries meaning here. Vermilion marks time, amber warns, violet marks keyboard focus — each
// hue states one meaning only. Selection breaks that rule on purpose: it reuses the bar's own blue,
// so a chosen item reads as "this data, picked". Role marks the difference — fill paints data,
// outline paints selection — not hue.
//
// The values are the `Gantt demo sandbox rebuild` design's Light and Graphite token sets (its
// Graphite is this sheet's `dark` — one name per concept, and `dark` is the one the public `Theme`
// type already publishes). The greys carry a trace of yellow, under 0.02 saturation: warm enough that
// the sheet sits inside a document page without reading as a screenshot, neutral enough that it does
// not fight a cold page around it. Dark inverts the bar to the light end of the same blue and gives it
// dark labels, which is what buys its 9:1 label contrast, and lifts every meaning hue together so
// their separation survives the move.
//
// --fg-bar-opacity is 1, not the 0.9 this sheet shipped before. At 0.9 the light theme's bar label
// measured about 4.1:1 against its own fill, under the 4.5:1 floor; the softening moved into the fill
// itself, which is a colour the theme controls, instead of an opacity that erodes the label with it.
//
// `theme: 'light'|'dark'` writes `data-fg-theme` on the Gantt's own container, not on `:root`: a
// `:root:not([data-fg-theme])` media query never sees that pin, so Light would leave the Gantt on the
// system dark tokens. The two attribute rules select on the attribute alone, so a consumer can write
// `data-fg-theme="dark"` on a wrapper around its own chrome — a toolbar above the Gantt — and
// `--fg-*` means the same thing there as inside. The library still only ever writes the attribute on
// its own container.

import { DEFAULT_TICK_BOX_FLOOR_PX, DEFAULT_DIAMOND_SIZE_PX } from '../layout/index.js';

const MARKER_ATTR = 'data-freegantt-styles';

const LIGHT_COLOR_TOKENS = `
  --fg-pane-bg: #FFFFFF;
  --fg-splitter-color: #E6E2D9;
  --fg-header-bg: #FFFFFF;
  --fg-header-band-bg: #F4F2EC;
  --fg-header-text: #1A1815;
  /* 6.1:1 on --fg-header-band-bg, the surface a tick label actually sits on (axe color-contrast,
     S5.11) — the 4.5:1 floor for normal text. */
  --fg-header-subtext: #5E5A53;
  --fg-header-divider-color: #E6E2D9;
  /* The timeline pane's own vertical grid, one line per finest-band tick boundary (.fg-tick-line).
     The ink at a low alpha, not an opaque grey. A line paints over whatever the row already paints —
     the pane, the zebra's odd row, a consumer's weekend band — and an opaque grey reads as a
     different weight on each of them. Measured as composited pixels: the opaque pair stepped 23 off
     an odd row and 30 off an even one, so the same grid line looked hard on one row and soft on the
     next. An alpha steps the same distance off any of them, because the step *is* a fraction of the
     distance to the ink. Both are still one token each: set either to transparent and that line
     stops painting, with no config key involved.
     The two alphas are the hierarchy, stated as that step: about 20 for a regular line, about 36 for
     a major one — roughly double, which is what makes a week division read as the coarser of the
     two without either shouting. */
  --fg-tick-line-color: rgb(26 24 21 / 0.09);
  /* A line the coarser header band changes over — the week holding the 1st, a week's Monday. */
  --fg-tick-line-strong-color: rgb(26 24 21 / 0.16);
  --fg-row-even-bg: transparent;
  --fg-row-odd-bg: #FAF8F2;
  --fg-row-hover-bg: #F6F3EB;
  /* A flat band, in the family --fg-row-hover-bg and --fg-row-odd-bg already belong to — not a mix
     of --fg-selection-color, because that reads against whatever sits behind the container instead
     of a colour axe can check on its own. */
  --fg-row-selected-bg: #EEF3FB;
  --fg-row-label-color: #1A1815;
  /* Set by its worst case, not its usual one: 5.1:1 on the pane, but a filtered-out row can also be
     selected, and on --fg-row-selected-bg it drops to 4.6:1 — still past the 4.5:1 floor (axe
     color-contrast, S5.11). */
  --fg-row-unmatched-label-color: #726D65;
  --fg-bar-fill: oklch(0.49 0.13 248);
  --fg-bar-label-color: #FFFFFF;
  /* J1: a label pushed outside the bar paints on the pane, not on --fg-bar-fill, so it takes the
     pane's own ink family (--fg-header-subtext's) rather than --fg-bar-label-color. */
  --fg-bar-label-outside-color: #5E5A53;
  /* Inside padding for the label span, and the gap between a bar's right edge and an outside label —
     one design value, one token (render/dom/index.ts's own DEFAULT_BAR_LABEL_GAP_PX states the same
     number as its JS-side fallback). */
  --fg-bar-label-gap: 8px;
  --fg-warn: #B4690E;
  /* The design states #CF3B26. A Date line label sits in a header band, and this theme paints that
     band cream (--fg-header-band-bg) where the old one painted it white — #CF3B26 reads 4.36:1
     there, under the 4.5:1 floor (axe color-contrast, S5.11). #C93820 is the same vermilion two
     steps darker: 4.61:1 on the band, 5.16:1 on the pane the stroke itself crosses. */
  --fg-date-line-color: #C93820;
  /* Ink on a Date/Cursor line label, which is a filled chip in the time colour — the same
     fill/label pairing --fg-bar-fill and --fg-bar-label-color already make. */
  --fg-date-line-label-color: #FFFFFF;
  /* The hovered bar's inset hairline — D-S3-7's hovered token, unpainted until now. It borrows no
     meaning hue, so a hovered bar and a selected one are never confusable — and it stays inside the
     bar's own box, so a hover never shifts a neighbour. */
  --fg-hover-ring: rgb(26 24 21 / 0.22);
  /* The dragged bar's lift — D-S3-7's dragging token. One static, hard-offset shadow: no blur to
     rasterize and no animation, so it never lands on the drag hot path. */
  --fg-drag-shadow: 0 2px 0 rgb(26 24 21 / 0.18);
  /* Selection is the accent blue, close to --fg-bar-fill on purpose, and it never touches it: the
     selected bar's outline sits 2px off the fill (outline-offset below), so the ring lands on the
     pane beside the bar, not on the fill itself. Keep that offset if this value ever changes. It
     must also stay clear of --fg-date-line-color and --fg-warn, which is what the old hue-25 red
     failed — it landed within a few degrees of the date line's own red, so a selected row and an
     error read as the same paint. This blue sits far from both. */
  --fg-selection-color: oklch(0.55 0.13 245);
  /* S5.11, D-S5-25/D-S5-26: the roving-focus ring — a hue of its own, so a keyboard-focused row/cell/
     bar/header-cell/splitter reads as "focused" and never as "selected" (--fg-selection-color) or
     "conflict"/"pending" (--fg-warn). This is the violet --fg-selection-color vacated above: the
     design carries no focus hue of its own, and violet stays unclaimed by every other meaning on
     this sheet, clear of the blue --fg-bar-fill and --fg-selection-color now share. */
  --fg-focus-ring: oklch(0.55 0.20 305);
  --fg-popup-bg: #FFFFFF;
  --fg-popup-border: #E6E2D9;
  --fg-popup-shadow: 0 8px 24px rgb(26 24 21 / 0.12);
`.trimEnd();

const DARK_COLOR_TOKENS = `
  --fg-pane-bg: #1B1D22;
  --fg-splitter-color: #2B2F36;
  --fg-header-bg: #1B1D22;
  --fg-header-band-bg: #22252B;
  --fg-header-text: #ECEAE3;
  /* 6.3:1 on --fg-header-band-bg (axe color-contrast, S5.11). */
  --fg-header-subtext: #A8A49B;
  --fg-header-divider-color: #2B2F36;
  /* The same rule as Light's pair, in the other direction: the theme's own light ink at a low alpha,
     so a line steps about 20 (regular) and about 36 (major) off whatever row it crosses. */
  --fg-tick-line-color: rgb(236 234 227 / 0.1);
  --fg-tick-line-strong-color: rgb(236 234 227 / 0.17);
  --fg-row-even-bg: transparent;
  --fg-row-odd-bg: #20232A;
  --fg-row-hover-bg: #262A32;
  --fg-row-selected-bg: #1F2A3F;
  --fg-row-label-color: #ECEAE3;
  /* Same worst-case rule the light theme takes: 5.8:1 on the pane, 4.9:1 on --fg-row-selected-bg. */
  --fg-row-unmatched-label-color: #9B978E;
  --fg-bar-fill: oklch(0.74 0.13 248);
  --fg-bar-label-color: #16181D;
  --fg-bar-label-outside-color: #A8A49B;
  --fg-bar-label-gap: 8px;
  --fg-warn: #E0A340;
  --fg-date-line-color: #FF6F57;
  --fg-date-line-label-color: #1B1D22;
  /* The ring inverts to the theme's own ink, the same move --fg-bar-fill and --fg-bar-label-color
     make: a light hairline reads on a dark bar where the light theme's dark one would vanish. */
  --fg-hover-ring: rgb(236 234 227 / 0.26);
  --fg-drag-shadow: 0 2px 0 rgb(0 0 0 / 0.45);
  --fg-selection-color: oklch(0.72 0.13 245);
  --fg-focus-ring: oklch(0.76 0.17 305);
  --fg-popup-bg: #22252B;
  --fg-popup-border: #3A3F48;
  --fg-popup-shadow: 0 10px 28px rgb(0 0 0 / 0.5);
`.trimEnd();

const BASE_STYLESHEET = `
:root {
${LIGHT_COLOR_TOKENS}
}
.fg-container {
${LIGHT_COLOR_TOKENS}
  --fg-indent-width: 12px;
  --fg-lane-gap: 2px;
  --fg-bar-opacity: 1;
}
@media (prefers-color-scheme: dark) {
  .fg-container:not([data-fg-theme]) {
${DARK_COLOR_TOKENS}
  }
}
/* Attribute only, no .fg-container: the token set follows the pin wherever the pin is written. Both
   rules come after the .fg-container block above and match at the same specificity, so a pinned
   container still reads its own set rather than the default light one. */
[data-fg-theme='light'] {
${LIGHT_COLOR_TOKENS}
}
[data-fg-theme='dark'] {
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
.fg-col-header { display: flex; align-items: center; min-width: 0; overflow: hidden; box-sizing: border-box; flex: var(--fg-col-flex, 1) 1 0; position: relative; cursor: pointer; padding-inline: var(--fg-cell-padding-inline, 10px); padding-block: var(--fg-cell-padding-block, 4px); }
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
/* S5.11, D-S5-25/D-S5-26: one focus ring style for every roving-focus target — the two panes
   themselves (axe scrollable-region-focusable: a scrollable pane needs its own tab stop), a grid
   row/cell, a column header cell, a bar, and the splitter. An inset ring keeps the outline inside
   the element's own box instead of colliding with a neighbour row/cell/bar. */
.fg-grid-pane:focus-visible,
.fg-timeline-pane:focus-visible,
.fg-row:focus-visible,
.fg-row-label:focus-visible,
.fg-row-cell:focus-visible,
.fg-col-header:focus-visible,
.fg-bar:focus-visible,
.fg-splitter:focus-visible {
  outline: 2px solid var(--fg-focus-ring);
  outline-offset: -2px;
}
.fg-timeline-pane { position: relative; flex: 1 1 auto; min-width: 0; overflow: auto; background: var(--fg-pane-bg); }
/* S1.12, D-S1.12-9/D-S1.12-15: height comes from band count × one band height, not a fixed total
   split N ways — and it stays pinned to the top of the timeline pane while rows scroll under it
   (closes the S1.8 debt, D-S1.12-15). */
.fg-header { background: var(--fg-header-bg); position: sticky; top: 0; z-index: 1; display: flex; flex-direction: column; height: auto; overflow: hidden; }
.fg-band { background: var(--fg-header-band-bg); color: var(--fg-header-text); border-bottom: 1px solid var(--fg-header-divider-color); position: relative; flex: 0 0 var(--fg-band-height, 24px); min-height: 0; }
/* padding/overflow are structural, not typography (D-S1.10-6/D-S1.11-8 leave font-size/family to the
   consumer): a tick's box is exactly its own width, so a label that would collide with its neighbour
   clips with an ellipsis instead of overflowing and garbling both (S1.12 header readability follow-up).
   border-left marks each tick's own cell boundary so adjacent ticks in the same band read as
   separate columns, matching .fg-band's existing border-bottom between bands.
   --fg-tick-box-floor is the Tick box floor (CONTEXT.md): padding-inline derives from it so the
   CSS box and layout's clamp input stay one Token. The 1px in the calc is this rule's border-left. */
.fg-tick { color: var(--fg-header-subtext); position: absolute; top: 0; left: 0; height: var(--fg-band-height, 24px); line-height: var(--fg-band-height, 24px); box-sizing: border-box; padding: 0 calc((var(--fg-tick-box-floor, ${DEFAULT_TICK_BOX_FLOOR_PX}px) - 1px) / 2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; border-left: 1px solid var(--fg-header-divider-color); }
.fg-row { background: var(--fg-row-even-bg); position: absolute; top: 0; left: 0; width: 100%; display: flex; align-items: stretch; --fg-row-depth: 0; }
/* Row parity comes from the frame's absolute row index (render/dom's rowParity), stamped as
   data-parity — not from :nth-child, which counts only the windowed rows and slides the whole zebra
   out of phase as soon as the pane scrolls. .fg-row-band is the timeline pane's copy of the same
   paint, from the same FrameRow, so the two panes stripe the same rows in both themes. */
.fg-row[data-parity='odd'], .fg-row-band[data-parity='odd'] { background: var(--fg-row-odd-bg); }
.fg-row[data-parity='even'], .fg-row-band[data-parity='even'] { background: var(--fg-row-even-bg); }
/* J2: one line per finest-band tick boundary, mounted between the decorations layer and .fg-bars, so
   the zebra, the selected-row band, and weekend shading paint over the lines, and every bar paints
   over them in turn — the design's own paint order. height is set inline per frame
   (render/dom/tick-lines.ts), not bottom: 0 — same reason .fg-date-line states: .fg-timeline-pane is
   both this element's positioned ancestor and its own overflow: auto scroll container. */
.fg-tick-lines { position: relative; }
.fg-tick-line { position: absolute; top: 0; left: 0; width: 1px; background: var(--fg-tick-line-color); pointer-events: none; }
.fg-tick-line[data-major] { background: var(--fg-tick-line-strong-color); }
.fg-row-bands { position: relative; }
.fg-row-band { position: absolute; top: 0; left: 0; width: 100%; pointer-events: none; }
.fg-row-label, .fg-row-cell { color: var(--fg-row-label-color); display: flex; align-items: center; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; box-sizing: border-box; flex: var(--fg-col-flex, 1) 1 0; padding-inline-end: var(--fg-cell-padding-inline, 10px); padding-block: var(--fg-cell-padding-block, 4px); }
.fg-row[data-matched='false'] .fg-row-label, .fg-row[data-matched='false'] .fg-row-cell { color: var(--fg-row-unmatched-label-color); }
/* Bug hunt (S5 fixes): a grid row's own selection paint (CONTEXT.md Parts/State) — a background, not
   an outline (an outline would fight the row's cell layout the way .fg-bar's never has to).
   --fg-row-selected-bg is its own flat token, not a mix of --fg-selection-color: a bar click still
   ties row and bar to one selection, but an opaque band is what axe's colour-contrast check can
   read, and it does not depend on whatever sits behind the container. */
/* Hover, then selection — a selected row that is also hovered reads as selected, because the later
   rule wins on equal specificity. Both paint the grid row and its timeline band from one
   paintRowState answer, so a row reads the same on both sides of the splitter. */
.fg-row[data-state~='hovered'], .fg-row-band[data-state~='hovered'] { background: var(--fg-row-hover-bg); }
.fg-row[data-state~='selected'], .fg-row-band[data-state~='selected'] { background: var(--fg-row-selected-bg); }
.fg-row-cell { padding-inline-start: var(--fg-cell-padding-inline, 10px); }
.fg-row-label { padding-inline-start: calc(var(--fg-row-depth, 0) * var(--fg-indent-width, 12px) + var(--fg-cell-padding-inline, 10px)); }
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
.fg-bar { --fg-bar-fill-painted: color-mix(in oklch, var(--fg-bar-fill) calc(var(--fg-bar-opacity) * 100%), transparent); background: var(--fg-bar-fill-painted); color: var(--fg-bar-label-color); border-radius: var(--fg-bar-radius, 4px); position: absolute; top: 0; left: 0; touch-action: none; display: flex; align-items: center; }
/* DESIGN-FACTS §2.4: a group bar is a solid rail 10px high in the row's own label ink, with a 4px
   downward cap at each end — not an outline box at full bar height, which shouted over every span
   bar under it. The box keeps the full bar height because that is the hit target; only the glyph
   inside it is ink, so both pieces read --fg-group-bar-ink and a state can swap that one value.
   --fg-group-bar-height is an undeclared knob with a default, the shape --fg-bar-radius takes. */
.fg-bar-summary { --fg-group-bar-ink: var(--fg-row-label-color); background: transparent; border: none; color: var(--fg-group-bar-ink); }
.fg-bar-summary::before { content: ''; position: absolute; left: 0; right: 0; top: 50%; height: var(--fg-group-bar-height, 10px); transform: translateY(-50%); background: var(--fg-group-bar-ink); border-radius: 1px; }
/* One 8x4 cap per end, hung off the rail's bottom edge. The wedge of a conic gradient whose apex
   sits at the tile's bottom centre is the same downward triangle the design draws with a border
   trick — and a border trick needs an element of its own, which a rail with two ends does not have. */
.fg-bar-summary::after { content: ''; position: absolute; left: 0; right: 0; top: calc(50% + var(--fg-group-bar-height, 10px) / 2); height: 4px; background: conic-gradient(from 315deg at 50% 100%, var(--fg-group-bar-ink) 0deg 90deg, transparent 90deg) left top / 8px 4px no-repeat, conic-gradient(from 315deg at 50% 100%, var(--fg-group-bar-ink) 0deg 90deg, transparent 90deg) right top / 8px 4px no-repeat; }
/* Bug hunt (S5 fixes): a milestone's painted span is floored and centred on the instant by
   barSpan (layout/frame.ts) so the rotated diamond — and the selection outline on .fg-bar itself
   — both fit inside the bar box. --fg-diamond-size is the one Token layout's floor and this glyph's
   own size share (CONTEXT.md), read the same way as --fg-tick-box-floor. color: transparent hides
   the diamond's own painted glyph from double-painting under ::before's own fill — .fg-bar-label
   opts back into a real ink below, because J1 lets a milestone carry a label same as any other bar. */
.fg-bar-diamond { background: transparent; overflow: visible; color: transparent; }
.fg-bar-diamond::before { content: ''; box-sizing: border-box; position: absolute; top: 50%; left: 50%; width: var(--fg-diamond-size, ${DEFAULT_DIAMOND_SIZE_PX}px); height: var(--fg-diamond-size, ${DEFAULT_DIAMOND_SIZE_PX}px); background: var(--fg-bar-fill-painted); border: var(--fg-diamond-stroke, none); transform: translate(-50%, -50%) rotate(45deg); }
.fg-bar-diamond .fg-bar-label { color: var(--fg-bar-label-color); }
/* J1: the default label — a keyed child (render/dom/index.ts), not bare text, so it can be
   positioned and coloured on its own once a barLabels placement pushes it outside the bar.
   min-width: 0 is what lets a flex child shrink below its own text's natural width at all; without
   it text-overflow never gets the chance to run. */
.fg-bar-label { min-width: 0; padding-inline: var(--fg-bar-label-gap, 8px); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* data-label='outside' (render/dom/index.ts's own resolveBarLabelPlacement) — the label leaves the
   bar's own box and paints on the pane beside it, in the pane's own ink rather than the bar fill's
   label colour, with no ellipsis: resolveBarLabelPlacement only ever chooses 'outside' when the full
   label already fits past the bar's right edge. */
.fg-bar[data-label='outside'] .fg-bar-label { position: absolute; left: 100%; top: 50%; transform: translateY(-50%); padding-inline-start: var(--fg-bar-label-gap, 8px); padding-inline-end: 0; overflow: visible; text-overflow: clip; color: var(--fg-bar-label-outside-color); }
.fg-bar[data-flag~="conflict"] { outline: 2px solid var(--fg-warn); }
/* D-S3-7: data-state is a fixed five-token projection of InteractionState, painted once here — not a
   per-bar modifier class (CONTEXT.md's State attribute entry). All five tokens paint now.
   Hover is a box-shadow and selection an outline, so a bar that is both wears both without either
   rule overwriting the other. */
.fg-bar[data-state~="hovered"] { box-shadow: inset 0 0 0 1px var(--fg-hover-ring); }
/* outline-offset: 2px is not cosmetic. --fg-selection-color now shares --fg-bar-fill's own hue, so
   an outline flush against the fill would nearly vanish into it. The offset moves the ring onto the
   pane beside the bar, where it reads against a different colour. */
.fg-bar[data-state~="selected"] { outline: 2px solid var(--fg-selection-color); outline-offset: 2px; }
/* A group bar's box is its hit target, not its ink: the shared outline and the shared inset ring
   would both frame a full-height rectangle of empty pane around a 10px rail. So the state paints on
   the rail. Selected swaps the rail's own ink for the selection colour — a group bar wears no outer
   border at all — and hovered rings the rail alone. Both need the box's own state paint cancelled
   first, and they sit after the shared rules so equal specificity resolves this way. */
.fg-bar-summary[data-state~="hovered"], .fg-bar-summary[data-state~="selected"] { outline: none; box-shadow: none; }
.fg-bar-summary[data-state~="selected"] { --fg-group-bar-ink: var(--fg-selection-color); }
.fg-bar-summary[data-state~="hovered"]::before { outline: 1px solid var(--fg-hover-ring); }
/* A diamond's box is its hit target, not its ink, exactly as a group bar's is: the shared outline
   frames a full-height rectangle of empty pane around a glyph the size of a checkbox. Both states
   paint on the glyph, where they ring the rotated shape itself. Same running order as the rail's —
   after the shared rules, so equal specificity resolves this way. */
.fg-bar-diamond[data-state~="hovered"], .fg-bar-diamond[data-state~="selected"] { outline: none; box-shadow: none; }
.fg-bar-diamond[data-state~="hovered"]::before { box-shadow: 0 0 0 1px var(--fg-hover-ring); }
.fg-bar-diamond[data-state~="selected"]::before { box-shadow: 0 0 0 2px var(--fg-selection-color); }
/* S3.5, D-S3-17: an unsettled beforeEntryMove/beforeEntryResize Promise holds the bar here. Selected
   uses 2px solid; pending uses 2px dotted of the same token so the two read apart. */
.fg-bar[data-state~="pending"] { opacity: var(--fg-pending-opacity, 0.6); outline: 2px dotted var(--fg-selection-color); outline-offset: 2px; }
/* S3.6, D-S3-18, U7: an installed extension hook's own preview extra (ItemPreview.extra) — a second
   bar the caller never grabbed, moved by the hook's own cascade. */
.fg-bar[data-state~="ghost"] { opacity: var(--fg-ghost-opacity, 0.4); pointer-events: none; }
/* The caller's own grabbed bar (ItemPreview.extra: false). It comes after 'pending' and 'ghost' so
   its opacity wins: a bar the pointer is carrying reads solid, whatever else it also is. */
.fg-bar[data-state~="dragging"] { box-shadow: var(--fg-drag-shadow); opacity: 1; }
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
/* A label is a filled chip, not bare coloured text. Bare text put a thin time-coloured word on the
   header band and asked it to clear 4.5:1 there; a chip carries its own ground, so the label reads
   at any band colour a theme picks.
   D-S1.13-8 retired the Today-only colour token with no alias: Today is a Date line that carries
   data-flag="today", not a line with a palette of its own. Paint now stamps that flag on the label
   as well as the stroke, so a consumer that wants Today apart from the rest can reach both halves —
   .fg-date-line[data-flag='today'] and .fg-date-line-label[data-flag='today']. The sheet itself
   states no such rule, which is the decision holding. */
.fg-date-line-label, .fg-cursor-line-label { position: absolute; left: 0; top: 0; white-space: nowrap; padding: 1px 5px; border-radius: 3px; background: var(--fg-date-line-color); color: var(--fg-date-line-label-color); }
/* S3.8, D-S3-15: hot-path Cursor line — same stroke token as Date lines, never a frame decoration. */
.fg-cursor-line { position: absolute; top: 0; z-index: 2; border-left: 1px solid var(--fg-date-line-color); pointer-events: none; }
.fg-cursor-line-label { z-index: 2; pointer-events: none; }
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
.fg-cell-editor-control { width: 100%; height: 100%; box-sizing: border-box; font: inherit; padding-inline: var(--fg-cell-padding-inline, 10px); border: 1px solid var(--fg-selection-color); border-radius: 3px; outline: none; background: var(--fg-pane-bg); color: var(--fg-row-label-color); box-shadow: 0 0 0 3px color-mix(in oklab, var(--fg-selection-color) 20%, transparent); }
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
.fg-cell-notice { position: absolute; top: 0; left: 0; box-sizing: border-box; pointer-events: none; display: flex; align-items: center; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font: inherit; padding-inline: var(--fg-cell-padding-inline, 10px); border: 1px solid var(--fg-warn); background: var(--fg-pane-bg); color: var(--fg-warn); }
/* S5.11, D-S5-26: the polite live region (view/live-region.ts). Visually hidden, never hidden from
   assistive tech — display: none/visibility: hidden would remove the node from the accessibility
   tree along with the page, and a screen reader would never read a text change it cannot see happen.
   The 1px clip-rect technique keeps the node painted, at zero size, off-screen. */
.fg-live-region { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
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
