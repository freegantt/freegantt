# FreeGantt — Styling and Theming

This page is the styling reference. It answers one question: how do you make a Gantt look
different from its shipped default?

<!-- doc-example-setup
// What the examples below stand on: a mounted Gantt, and the app's own dark-mode signal.
declare const gantt: import('freegantt').Gantt;
declare const isDark: boolean;
-->

## The two levels

The library exposes styling on two levels:

- **Level 1 — `--fg-*` custom properties.** A CSS custom property on the container, or on `:root`.
  It restyles a colour, a shadow, or a structural pixel value across the whole Gantt with one
  declaration. Reach for this first — it is the supported way to restyle, and it covers most of
  what a consumer wants to change.
- **Level 2 — Parts.** The `.fg-*` class names on the rendered DOM. Write a stylesheet rule
  against one when level 1 has no token for what you want to change — a public Part carries a
  stability promise, an internal Part does not.

A consumer with no CSS of its own gets the library's own defaults, listed below. Start with the
token tables; drop to the Parts list only when no token reaches what you need.

## Level 1 — the `--fg-*` token reference

Level 1 is CSS custom properties. This section lists every `--fg-*` token the base stylesheet
(`src/view/styles.ts`) reads, its light and dark default, and what reads it.

The whole base stylesheet ships inside one cascade layer, `@layer freegantt`. Your own
CSS rule wins over the library's, at any specificity, with no `!important` — the library's sheet
never needs to be beaten by writing a longer selector than it did.

A consumer with no CSS of its own gets these defaults. Every one is overridable by setting the same
property on the container element, which the stylesheet's own `var(--fg-token, default)` always
prefers over its fallback. A pixel metric is read through one shared reader
(`render/dom/pixel-property.ts`): computed value → px → validated → library default. A colour or
shadow token is a plain CSS custom property the base stylesheet's own class rules consume directly —
no JS reads it.

Two kinds of `--fg-*` property share the prefix, and only one kind is a consumer's to read or set.
Every token in the two tables below is a **consumer token**: the base stylesheet declares its
default outright, once, on `:root`, in addition to reading it as `var(--fg-x, default)` inside its own
rules. That declaration is what makes the default *readable*, not just overridable — a consumer's own
CSS rule can write `border-radius: var(--fg-bar-radius)` with no fallback of its own and get the real
4px back, from any element in the document, and a closer declaration (a wrapper, `.fg-container`, an
inline style) still wins by ordinary inheritance proximity — the same reach colour tokens already had.
The other kind, a **per-element channel**, is never declared on `:root` or anywhere else: the library
writes it inline, on one element, because a single stylesheet rule cannot express what it carries — a
column's own flex-grow, a row's own depth. Its `var(--fg-x, default)` fallback *is* its unset case, and
a consumer declaration would only fight the next write, which overwrites it. See "Internal tokens —
not a consumer's to set" below for the four channels.

### Structural and pixel tokens

| Token | Default | Read by |
|---|---|---|
| `--fg-row-height` | `36px` | `pixel-property.ts`, re-read on every pane measurement |
| `--fg-grid-pane-width` | `160px` | `pixel-property.ts`, read once at construction |
| `--fg-splitter-width` | `4px` | `pixel-property.ts` |
| `--fg-band-height` | `24px` | `.fg-band` / `.fg-tick` CSS (`--fg-header-height` retired — see below) |
| `--fg-tick-box-floor` | `9px` | `.fg-tick` padding calc + `pixel-property.ts` into `LayoutInput.tickBoxFloorPx` |
| `--fg-bar-min-width` | `12px` | `pixel-property.ts` into `LayoutInput.minBarWidthPx` — every bar's painted-span floor; `FrameBar.span: 'minimum'` / `data-span="minimum"` mark a bar this floor touched. A Bar that carries its own `box` skips this floor entirely — `FrameBar.span: 'fixed'` / `data-span="fixed"` mark it instead, and its width is the box's own `widthPx`, never this token |
| `--fg-bar-height` | `18px` | `pixel-property.ts` into `LayoutInput.barHeightPx` — a bar's own painted height, independent of `--fg-row-height`; centres in its row |
| `--fg-bar-radius` | `4px` | `.fg-bar` CSS rule directly (not `pixel-property.ts` — a border-radius, not a layout number) |
| `--fg-column-width` | `120px` | `column-chrome.ts`, re-read on every column rebind — the width a column takes when neither its own `width` nor its Field's `column.width` names one |
| `--fg-column-min-width` | `40px` | `column-chrome.ts` — floors how far a resize drag or a keyboard step can shrink a column |
| `--fg-column-resizer-hit` | `12px` | `.fg-column-resizer::before` — widens the resize grip's pointer hit target only; the visible grip stays 6px, and no JS reads this token |
| `--fg-cell-padding-inline` | `10px` | `.fg-col-header`, `.fg-row-label`, `.fg-row-cell` — the one pair a header cell and a row cell both read, so grid text never sits flush against a column's edge |
| `--fg-cell-padding-block` | `4px` | `.fg-col-header`, `.fg-row-label`, `.fg-row-cell` |
| `--fg-indent-width` | `12px` | `.fg-row-label` indent calc, `.fg-row-twisty` width — one hierarchy-depth step |
| `--fg-bar-label-gap` | `8px` | `pixel-property.ts`, read once at `mount()` — `.fg-bar-label` inline padding, and the gap between a bar's right edge and an outside label |
| `--fg-z-overlay` | `3` | `.fg-overlay` CSS rule directly (not `pixel-property.ts` — a stacking position, not a layout number). Set above every internal layer (the grid header, the timeline header, a dragged column header, the date cursor line) so a mounted `.fg-popup` — a tooltip or a `contextMenu()` — always paints, and hit-tests, above them. Raise it further when this Gantt sits inside a consumer's own stacking context |

### Colour and shadow tokens

| Token | Default (light) | Default (dark) | Read by |
|---|---|---|---|
| `--fg-pane-bg` | `#FFFFFF` | `#1B1D22` | `.fg-grid-pane`, `.fg-timeline-pane` background |
| `--fg-splitter-color` | `#E6E2D9` | `#2B2F36` | `.fg-splitter` background |
| `--fg-header-bg` | `#FFFFFF` | `#1B1D22` | `.fg-header` background |
| `--fg-header-band-bg` | `#F4F2EC` | `#22252B` | `.fg-band` background |
| `--fg-header-text` | `#1A1815` | `#ECEAE3` | `.fg-band`/`.fg-tick` text, `.fg-grid-header` text |
| `--fg-header-subtext` | `#5E5A53` | `#A8A49B` | `.fg-tick` text, `.fg-tooltip-dates` |
| `--fg-header-divider-color` | `#E6E2D9` | `#2B2F36` | rule between header bands, `.fg-menu-separator` |
| `--fg-tick-line-color` | `rgb(26 24 21 / 0.09)` | `rgb(236 234 227 / 0.1)` | `.fg-tick-line` — the timeline pane's own vertical grid line, one per finest-band tick boundary |
| `--fg-tick-line-strong-color` | `rgb(26 24 21 / 0.16)` | `rgb(236 234 227 / 0.17)` | `.fg-tick-line[data-major]` — the coarser header band's own boundary line |
| `--fg-row-even-bg` | `transparent` | `transparent` | `.fg-row[data-parity='even']`, `.fg-row-band[data-parity='even']` |
| `--fg-row-odd-bg` | `#FAF8F2` | `#20232A` | `.fg-row[data-parity='odd']`, `.fg-row-band[data-parity='odd']` |
| `--fg-row-hover-bg` | `#F6F3EB` | `#262A32` | `.fg-row[data-state~='hovered']`, `.fg-row-band[data-state~='hovered']` |
| `--fg-row-selected-bg` | `#EEF3FB` | `#1F2A3F` | `.fg-row[data-state~="selected"]`/`.fg-row-band[data-state~="selected"]` background — a flat token, not a mix of `--fg-selection-color` |
| `--fg-row-label-color` | `#1A1815` | `#ECEAE3` | `.fg-row-label`/`.fg-row-cell` text; `.fg-cell-editor-control` text |
| `--fg-row-unmatched-label-color` | `#726D65` | `#9B978E` | `.fg-row-label`/`.fg-row-cell` text on a row `data-matched='false'` marks — a grouping row whose value no `groupBy` bucket claimed |
| `--fg-bar-fill` | `oklch(0.49 0.13 248)` | `oklch(0.74 0.13 248)` | `.fg-bar`'s `--fg-bar-fill-painted` mix, below |
| `--fg-bar-opacity` | `1` | — (not theme-dependent) | `.fg-bar`'s `--fg-bar-fill-painted` mix, below |
| `--fg-bar-label-color` | `#FFFFFF` | `#16181D` | `.fg-bar` text |
| `--fg-bar-label-outside-color` | `#5E5A53` | `#A8A49B` | `.fg-bar[data-label='outside'] .fg-bar-label` — a label pushed past the bar's own edge paints on the pane, so it takes the pane's own ink family instead of `--fg-bar-label-color` |
| `--fg-warn` | `#B4690E` | `#E0A340` | `.fg-bar[data-flag~="conflict"]` outline; the invalid cell editor's ring and discard button; `.fg-cell-notice`'s border and text |
| `--fg-date-line-color` | `#C93820` | `#FF6F57` | `.fg-date-line`, `.fg-date-line-label`, `.fg-cursor-line`, `.fg-cursor-line-label` |
| `--fg-date-line-label-color` | `#FFFFFF` | `#1B1D22` | `.fg-date-line-label`, `.fg-cursor-line-label` text — the chip's own ink, paired with `--fg-date-line-color` as its fill |
| `--fg-hover-ring` | `rgb(26 24 21 / 0.22)` | `rgb(236 234 227 / 0.26)` | `.fg-bar[data-state~="hovered"]` — the hovered bar's inset hairline |
| `--fg-drag-shadow` | `0 2px 0 rgb(26 24 21 / 0.18)` | `0 2px 0 rgb(0 0 0 / 0.45)` | `.fg-bar[data-state~="dragging"]` — the dragged bar's lift |
| `--fg-selection-color` | `oklch(0.55 0.13 245)` | `oklch(0.72 0.13 245)` | `.fg-bar[data-state~="selected"]` outline, offset 2px off the bar (pending uses the same token, dotted); the column reorder drop indicator; the open cell editor's ring |
| `--fg-ghost-opacity` | `0.4` | — | `.fg-bar[data-state~="ghost"]` |
| `--fg-pending-opacity` | `0.6` | — | `.fg-bar[data-state~="pending"]` |
| `--fg-drop-line-color` | `oklch(0.55 0.13 245)` | `oklch(0.72 0.13 245)` | `.fg-row[data-drop="into"]`/`.fg-row-band[data-drop="into"]` outline; `.fg-drop-line` background — a vertical drag's target row and its Insertion line |
| `--fg-drop-refused-bg` | `rgb(180 105 14 / 0.14)` | `rgb(224 163 64 / 0.18)` | `.fg-row[data-drop="refused"]`/`.fg-row-band[data-drop="refused"]` — the row a vertical drag may not land on |
| `--fg-focus-ring` | `oklch(0.55 0.20 305)` | `oklch(0.76 0.17 305)` | the roving-focus outline shared by both panes, a grid row/cell, a column header cell, a bar, and the splitter (`:focus-visible`) — its own hue, so a keyboard focus never reads as a selection or a conflict |
| `--fg-popup-bg` | `#FFFFFF` | `#22252B` | `.fg-popup` background — the shared surface `tooltips()`, `contextMenu()`, and the reorder drag wash draw from |
| `--fg-popup-border` | `#E6E2D9` | `#3A3F48` | `.fg-popup` border |
| `--fg-popup-shadow` | `0 8px 24px rgb(26 24 21 / 0.12)` | `0 10px 28px rgb(0 0 0 / 0.5)` | `.fg-popup` box-shadow; also the grabbed header cell's lifted shadow during a column reorder drag |
| `--fg-time-shading-fill` | `rgb(26 24 21 / 0.05)` | `rgb(236 234 227 / 0.07)` | `.fg-time-shading` background — `timeShading()`'s own wash, one notch past `--fg-tick-line-strong-color`'s own alpha so a shaded band still separates from a tick line crossing it |

Colour defaults are sourced from an existing, unnamed palette this team maintains elsewhere — only
the *values* cross over, never the palette's name. `theme: 'auto' | 'light' | 'dark'` (default `'auto'`) selects
which block applies. Resolution runs in one order, the same inside `.fg-container` and outside it:
the nearest `data-fg-theme` pin, on the element or any ancestor, wins first; else
`prefers-color-scheme` (`:root:not([data-fg-theme])`) decides; else the light default on `:root`
applies. `'auto'` writes no `data-fg-theme` attribute, so it is the state that lets an ancestor's
pin, or failing that the system's, reach the Gantt. `'light'`/`'dark'` write the attribute on the
container, which is the nearest pin there can be to it, so a pin always wins over an ancestor's pin
or the media query — on document order at equal specificity, not because either attribute rule is
more specific than the other. The two attribute blocks select on `[data-fg-theme='light'|'dark']`
alone, not on `.fg-container`, so a consumer can put the same attribute on a wrapper around its own
chrome — a toolbar above the Gantt — and every `--fg-*` there means what it means inside;
`.fg-container` itself declares no colour of its own, so nothing on it blocks that inheritance. The
library writes the attribute on its own container only; mirroring it onto anything else is the
consumer's own call. No named multi-preset picker beyond light/dark ships yet.

**The app pushes the theme; the library never asks it back.** A wrapping app usually
carries its own dark-mode signal — a class on `<html>`, or an attribute a framework writes there —
and it is rarely the two signals `theme: 'auto'` reads. The app's
own toggle already knows the answer, so it costs one more line to push it: either write
`gantt.theme` directly

```ts
gantt.theme = isDark ? 'dark' : 'light';
```

or pin an ancestor once and never touch the Gantt again

```html
<div data-fg-theme="dark"><div id="gantt"></div></div>
```

mirroring the same class in the app's own toggle. `harness/e2e/theme-push.html` demonstrates both.
Every harness demo page uses the pin: `harness/page-theme.ts` writes `data-fg-theme` on `<html>`,
every Gantt stays on `'auto'`, and the page chrome reads the same `--fg-*` tokens as the chart.
`'auto'` keeps reading an ancestor's `data-fg-theme` pin and then `prefers-color-scheme` — both
signals the library defines or the platform defines, never a guess at a convention some framework
holds.

### Theme API — resolvedTheme, themeChange, checkResolvedTheme

**`gantt.resolvedTheme` answers `'light'` or `'dark'` — never `'auto'`**: the getter reads
back what `theme` actually resolved to. `themeChange` fires beside it when that answer
moves, for any of three causes the library can see on its own — a `theme` assignment that changes
the pin, the OS flipping under `'auto'` with no ancestor pin in the way, or an ancestor's own pin
changing (watched by a `MutationObserver` scoped to `data-fg-theme`). It has no `before*`
pair, the same reason `navigationChange` has none: none of these causes is a vetoable gesture, and
the `theme` half already has its own live setter.

**`gantt.checkResolvedTheme()`** covers the one case those three causes miss: re-parenting.
Moving this Gantt's own container under a differently-pinned wrapper changes what `resolvedTheme`
answers, but writes no `data-fg-theme` attribute, so nothing wakes the observer above. A consumer
that just made that move calls `checkResolvedTheme()` to say so — it re-resolves now, fires
`themeChange` if the answer moved, and returns that answer either way, so a caller needs no separate
`resolvedTheme` read after.

**No event fires before `new Gantt()` returns** — `themeChange` included, and this is the
whole reason it never used to. A constructor-supplied plugin has already subscribed by the time the
constructor keeps wiring, but the `theme` write that constructor applies, an initial `selection`,
and the first frame's own preset settling are construction finishing, not a reported change. A
plugin that wants the starting state reads it straight off `ctx.gantt` in `setup()` instead —
`resolvedTheme`, `selection`, and `preset` are all gettable there already.

**`--fg-bar-opacity` fades a bar's fill without fading its label or its border.** `.fg-bar` reads
`--fg-bar-fill` and `--fg-bar-opacity` together and writes the mix to `--fg-bar-fill-painted`:
`color-mix(in oklch, var(--fg-bar-fill) calc(var(--fg-bar-opacity) * 100%), transparent)`. A
consumer's own glyph reads `--fg-bar-fill-painted` too, so one token dims a span bar and a glyph
the same way. A summary rail is the exception: it paints from `--fg-group-bar-ink`, the row ink, and
this token does not reach it. The mix rule lives on `.fg-bar` itself, not on `.fg-container` — a `barRenderer`
that overrides `--fg-bar-fill` on one bar element sees its own override in the mix, because the read
and the override sit at the same element. `--fg-bar-opacity` itself stays declared on `.fg-container`
and inherits down unchanged, so one setting still covers every bar.

### Internal tokens — not a consumer's to set

Six `--fg-*` properties are the library's own plumbing, not a consumer's to set. Five are geometry
the library writes inline, per element, because a stylesheet rule alone cannot express it — setting
one by hand fights the next frame, which overwrites it. The sixth, `--fg-bar-fill-painted`, is
different: the base stylesheet computes it on `.fg-bar` itself, from `--fg-bar-fill` and
`--fg-bar-opacity` (see the note above) — a consumer sets the two colour tokens that feed it, never
this one.

| Token | Written by | Read by |
|---|---|---|
| `--fg-col-flex` | `render/dom/index.ts`, per column header/cell — the column's own flex-grow, or removed for a fixed column | `.fg-col-header`, `.fg-row-label`, `.fg-row-cell` `flex` |
| `--fg-grid-content-width` | `pane-layout.ts`, on the grid pane — how far a fixed-width column set overflows the pane | `.fg-grid-spacer`, `.fg-rows-clip` `width` (falls back to `100%`) |
| `--fg-row-depth` | `render/dom/index.ts`, per row — the row's hierarchy depth | `.fg-row-label` indent calc (with `--fg-indent-width`, above) |
| `--fg-drop-line-depth` | `render/dom/index.ts`, on the grid pane's `.fg-drop-line` — the target place's tree depth during a vertical drag | `.fg-drop-line` indent calc (with `--fg-indent-width`, above) — the timeline instance resets it to 0 (full width) |
| `--fg-popup-max-height` | `popup.ts`, on the popup wrapper — the anchor pane's height minus the popup's 1px top and bottom border | `.fg-popup` `max-height` (falls back to `none`) |
| `--fg-bar-fill-painted` | `.fg-bar`'s own CSS rule (`styles.ts`), computed from `--fg-bar-fill` and `--fg-bar-opacity` | `.fg-bar` background |

### Retired and renamed tokens

- **`--fg-header-height`** shipped with fallback `20` and was later retired — a fixed header height
  could not size N header bands correctly. Migration: `--fg-header-height: 40px` on a two-band preset
  becomes `--fg-band-height: 20px`. The grid pane's spacer now mirrors one empty `.fg-band` per
  header band, so both panes size from `--fg-band-height` alone. `src/view/styles.test.ts` asserts
  the retired name is gone from the stylesheet.
- **`--fg-row-label-width`** was renamed to `--fg-grid-pane-width` — the gutter became a pane width,
  not a backend reservation. No file under `src/` still reads the old name.

## Level 2 — the Parts list

Level 2 is the Parts list: every `.fg-*` class the base stylesheet (`src/view/styles.ts`) defines,
plus the two glyph classes `summary()` and `diamond()` ship in their own CSS
(`src/layout/bars/variants.ts`).

A **public** Part is level-2 surface a consumer stylesheet targets. An **internal** Part is plumbing:
the reconciler owns the node, and there is no stability promise on the name. Publishing the internal
names is the point — omitting them let this list go stale before. Styling one is allowed and
unsupported.

The vocabulary is closed and un-renamed. Additions before 1.0 are for a real structural gap, not a
rename.

### Public Parts

| Part | Role |
|---|---|
| `.fg-container` | Root of one Gantt. Theme pin and token inheritance start here. |
| `.fg-grid-pane` | Left pane. Grid columns, row labels, cells. |
| `.fg-timeline-pane` | Right pane. Header, bars, decorations, date lines. |
| `.fg-shared-axis` | On `.fg-timeline-pane` when this Gantt shares a `ScrollAxis` on `x`. Reserves a scrollbar gutter, so every pane on that axis keeps one width. Needs `scrollbar-gutter`; an engine without it falls back to today's behaviour, where the two panes stop up to a scrollbar's width apart. |
| `.fg-splitter` | Drag handle between the two panes. |
| `.fg-overlay` | Popup mount layer above both panes. `pointer-events: none` until a `.fg-popup` opts in. |
| `.fg-grid-header` | Column header row in the grid pane. |
| `.fg-col-header` | One column header cell. |
| `.fg-col-header-label` | The header cell's own text. Ellipsizes. |
| `.fg-column-resizer` | Column resize grip on a header cell. |
| `.fg-row` | One grid row. Zebra, hover, and selection paint live here. |
| `.fg-row-label` | First-column label cell. Carries hierarchy indent. |
| `.fg-row-label-text` | The label cell's text child. |
| `.fg-row-cell` | A data cell in the grid. |
| `.fg-meter` | `meter()` wrapper. Track plus optional formatted text. |
| `.fg-meter-track` | The meter graphic. `aria-hidden` when text sits beside it. |
| `.fg-meter-fill` | The filled portion of the track. Width is the clamped percent. |
| `.fg-meter-text` | The Field's formatted value beside the track. |
| `.fg-image-cell` | `image()` img. |
| `.fg-row-twisty` | Collapse control on a parent row. |
| `.fg-header` | Sticky time header in the timeline pane. |
| `.fg-band` | One header band. Height is `--fg-band-height`. |
| `.fg-tick` | One tick label inside a band. |
| `.fg-tick-line` | Vertical grid line in the timeline body. One per finest-band tick. |
| `.fg-row-band` | Timeline copy of a grid row's zebra, hover, and selection paint. |
| `.fg-bar` | One Bar. Every look wears this class, diamonds included. |
| `.fg-bar-label` | The bar's own text child. Hidden (`data-label='hidden'`) until its bar is wide enough, under `barLabels: 'insideOrNone'`. |
| `.fg-bar-handle` | Shared resize-handle pair, moved onto the resizable bar. |
| `.fg-bar-summary` | `summary()` glyph. CSS ships with the variant, not the base sheet. |
| `.fg-bar-diamond` | `diamond()` glyph. CSS ships with the variant, not the base sheet. |
| `.fg-date-line` | A Date line stroke, Today included. |
| `.fg-date-line-label` | Date line chip. |
| `.fg-cursor-line` | Hot-path cursor stroke under the pointer. |
| `.fg-cursor-line-label` | Cursor line chip, always below the header bands. |
| `.fg-drop-line` | A vertical drag's Insertion line — one in the grid pane, inset by the target depth, one full-width in the timeline pane. |
| `.fg-decorations-under` | Decoration layer below the bars. |
| `.fg-decorations-over` | Decoration layer above the bars. |
| `.fg-range-band` | A range decoration (weekend shading, and the like). |
| `.fg-row-stripe` | A row-height decoration stripe. |
| `.fg-time-shading` | `timeShading()`'s own band, beside `.fg-range-band` — the Part `--fg-time-shading-fill` paints. |
| `.fg-popup` | Shared popup surface for tooltips, the context menu, and the reorder wash. |
| `.fg-tooltip` | `tooltips()` content, inside `.fg-popup`. |
| `.fg-tooltip-title` | Tooltip title line. |
| `.fg-tooltip-dates` | Tooltip date line. |
| `.fg-menu` | `contextMenu()` content, inside `.fg-popup`. |
| `.fg-menu-item` | One menu command. |
| `.fg-menu-separator` | A rule between menu items. |
| `.fg-cell-editor` | `inlineEditing()` wrapper on an open cell. |
| `.fg-cell-editor-control` | The editor's own input. |
| `.fg-cell-editor-discard` | Discard button on an invalid editor. |
| `.fg-cell-notice` | Refusal notice over a cell that cannot open an editor. |

### `data-flag`

`data-flag` is a space-separated token list. It has two producers: `BarFlags`/`LinkFlags` and the
Today line wrapper (`render/dom/date-line.ts`), which writes `today` independently of the
`BarFlags`/`LinkFlags` key set. `BAR_FLAG_KEYS` (`src/layout/frame.ts`, a public export) names the
closed key set for the first producer's bar side; `LINK_FLAG_KEYS` is the same list for the link
side but stays internal — see the note below. A Vitest guard (`test/guards/flag-selectors.test.ts`)
fails if a key here has no row below, or a row here names a key the list does not.

`.fg-bar` paints `data-flag` today; every key stays false until the scheduling plugin sets one
true. `.fg-link` paints nothing yet — no code under `render/dom` reads `GeometryFrame.links` — so
its two rows name the vocabulary that element will carry once the scheduling plugin adds it, not a
selector a stylesheet can match now (this is why `LINK_FLAG_KEYS` is not exported from `api/`:
nothing yet paints a `.fg-link` for a consumer's rule to match). `.fg-date-line` and
`.fg-date-line-label` paint `data-flag="today"` now, on every frame where the Today line shows —
but the shipped stylesheet carries no rule against either selector; Today gets no palette of its
own. Styling Today apart from an ordinary Date line is a rule the consumer writes, against
`.fg-date-line[data-flag~="today"]` or `.fg-date-line-label[data-flag~="today"]`; the library ships
none out of the box. See "Date lines and the Today line" below for the worked example.

| Selector | Set by |
|---|---|
| `.fg-bar[data-flag~="conflict"]` | the scheduling plugin |
| `.fg-bar[data-flag~="cycle"]` | the scheduling plugin |
| `.fg-link[data-flag~="inactive"]` | the scheduling plugin |
| `.fg-link[data-flag~="cycle"]` | the scheduling plugin |
| `.fg-date-line[data-flag~="today"]` | the library (Today line) |
| `.fg-date-line-label[data-flag~="today"]` | the library (Today line) |

### `data-drop`

`data-drop` marks a vertical drag's own row target, on `.fg-row` and its timeline `.fg-row-band`
alike, and on `.fg-container` for the refused cursor. It is present only during a drag whose pointer
has left the source row, and clears the moment the drag ends or returns to that row.

| Selector | Meaning |
|---|---|
| `.fg-row[data-drop="before"]`, `.fg-row-band[data-drop="before"]` | the drop lands as this row's previous sibling — `.fg-drop-line` marks the exact boundary |
| `.fg-row[data-drop="after"]`, `.fg-row-band[data-drop="after"]` | the drop lands as this row's next sibling — `.fg-drop-line` marks the exact boundary |
| `.fg-row[data-drop="into"]`, `.fg-row-band[data-drop="into"]` | the drop lands as this row's own child — the row's own outline is the indicator, no `.fg-drop-line` |
| `.fg-row[data-drop="refused"]`, `.fg-row-band[data-drop="refused"]` | no rule lets the drop land on this row |
| `.fg-container[data-drop="refused"]` | sets `cursor: not-allowed` over the whole Gantt while the pointer sits over a refused row |

### Internal Parts

These names have no stability promise. A consumer rule against one is allowed and unsupported —
the next layout pass owns the node.

| Part | Mounted by | Why internal |
|---|---|---|
| `.fg-grid-spacer` | `pane-layout.ts` | Sizes the grid content to overflowing columns. A rule here fights the next frame. |
| `.fg-rows-clip` | `pane-layout.ts` | Clips windowed grid rows. The reconciler owns overflow here. |
| `.fg-rows` | `pane-layout.ts` | Holds the windowed grid rows. |
| `.fg-header-bands` | `render/dom/index.ts` | Clips the band stack so `.fg-header` can stay `overflow: visible`. |
| `.fg-tick-lines` | `render/dom/tick-lines.ts` | Positioned ancestor for tick-line strokes. |
| `.fg-row-bands` | `render/dom/index.ts` | Holds the `.fg-row-band` copies. |
| `.fg-bars` | `render/dom/index.ts` | Holds the `.fg-bar` nodes. |
| `.fg-content-sizer` | `render/dom/index.ts` | Hidden 1×1 marker for the timeline scroll extent. |
| `.fg-date-lines` | `render/dom/date-line.ts` | Positioned ancestor for date-line strokes. |
| `.fg-live-region` | `view/live-region.ts` | Visually hidden polite live region. Not a painted surface. |

## Date lines and the Today line

**The Today line has a default style.** `src/view/styles.ts` gives `.fg-date-line` a 1px stroke
through `--fg-date-line-color` (`#C93820` light, `#FF6F57` dark), and `.fg-date-line-label` paints a
filled chip from the same token. The Today line is visible out of the box, with no consumer CSS.

**There is no Today-specific rule, and that is deliberate.** The library gives every date line the
same stroke. It ships no separate style for the today line: Today is a Date line that carries
`data-flag="today"`, and the base stylesheet has no rule that matches that flag. A consumer that
wants the today line to look different reaches `.fg-date-line[data-flag='today']` and
`.fg-date-line-label[data-flag='today']` — the stroke and the label are two elements, and each
needs its own rule.

### The harness's worked example

`harness/harness-chrome.css` (the `.demo-mobilization-line` rule) shows the supported path. It overrides the **token**
`--fg-date-line-color`, not a Part rule, on its own `.demo-mobilization-line` class — a date line
the demo names for something other than Today:

```css
.demo-mobilization-line {
  border-left-style: dashed;
  border-left-width: 2px;
  --fg-date-line-color: var(--warn);
}
```

The file's own comment explains why one declaration restyles both the stroke and the label: the
stroke and its label both read `--fg-date-line-color`, so overriding the token — not writing a
level-2 Part rule — moves both at once.

`harness/harness-chrome.css`'s Paper theme (`:root.theme-paper`) sets the same pair of tokens, to restyle
every date line the page shows:

```css
--fg-date-line-color: #b0361f;
--fg-date-line-label-color: #faf7ee;
```

Reach for the token first. Drop to a `data-flag='today'` Part rule only when Today itself, and
nothing else, needs to look different from every other Date line.
