# FreeGantt — Consumer API (index)

This file points app authors at the consumer surface. It does not replace the spec.

## Start here

| Document | What it is |
| --- | --- |
| [`README.md`](../README.md) | Quick start, dates/ids, and the API as it ships on the current branch |
| [`plans/02-public-api.md`](../plans/02-public-api.md) | Full public API design — events, errors, serialization, customization ladder |
| [`CONTEXT.md`](../CONTEXT.md) | Glossary — one word per concept (Entry, Field, Row, Row source, Rollup, …) |
| [`etc/freegantt.api.md`](../etc/freegantt.api.md) | Generated TypeScript export list (api-extractor); rendered at [`harness/docs/api-reference.html`](../harness/docs/api-reference.html) |
| [`docs/06-plugin-authoring.md`](06-plugin-authoring.md) | Plugin authoring guide — `definePlugin`, the two halves, every registration seam |

## S4 surface (hierarchy and rows)

These landed in slice S4. Details and examples live in `plans/02-public-api.md` §4.2–§4.3.

### Dataset

- `fields`, `fieldTypes`, `aggregators` — declare consumer Fields beside core's
- A parent rolls up because it has children (ADR 0013). An Entry carries no stored classification, so nothing opts a row in or out by kind.
- `entries.get(id)?.read(key)`, `dataset.field(key)`, `dataset.fields.all` — `read` is the one value door (ADR 0017)
- `plugins` — a plugin with a `data` half installs here (ADR 0019)

### Gantt

- `gridColumns` — which columnable Fields this view shows, in order
- Grid columns are fixed-width (#139). A column takes its own `width`, else its Field's `column.width`, else `--fg-column-width` (120). When the set outgrows the grid pane, the pane scrolls horizontally to reach it (#126). Give a column `flex` instead to have it share the pane's leftover room.
- The grid pane never sits wider than its columns (#139) — a splitter drag stops at the last column's edge, and a `gridWidth` past it is capped to it. Narrower is always fine: the columns overflow and the pane scrolls. A `flex` column lifts the cap, since it has no fixed edge.
- `gridWidth: 'fitColumns'` (#157) — size the grid pane to its columns and keep it there, instead of hand-computing the number. Live, and re-measured whenever the columns change. Reads back in px. A Splitter drag ends it; a `flex` column leaves nothing to fit, so the pane keeps the width it has.
- `rowSource` — what rows are (`entries` tree, `group` by value, or `custom` resolve)
- `rowSource.filter` / `groupBy` / `sort.compare` — receive the bound Field reader as a second argument (`(entry, fields) => fields.read(entry, 'team')`). One-argument callbacks still work.
- `rowSource.heightMode: 'pack'` — stack overlaps into lanes (on the row source, not on `Gantt`)
- `collapsed`, `collapse()`, `expand()`, `toggleCollapse()`, `collapseAll()`, `expandAll()` — per-Gantt view state
- Events: `beforeCollapseChange` / `collapseChange`
- `scroll` — pass the same `ScrollModel` into a new `Gantt` after `destroy()` so pane scroll survives remount (for example after `Dataset.fromJSON`). Do not copy `scrollTop` off the pane.
- `variants` — the rules this Gantt paints rows with (ADR 0018); `bar()`, `summary()`, `diamond()` are core's own shipped looks (ADR 0022).
- `gantt.variantFor(entry): ResolvedVariant` (ADR 0022) — the whole variant this Gantt resolved for one row, never `entry.variant`: an Entry belongs to a `Dataset`, a variant resolves per Gantt, and two Gantts on one Dataset may answer differently for the same row.

### Naming

Use **`gantt.rowSource`**, not `gantt.rows`. The config names the source; `Row` is the derived track
(`CONTEXT.md`). `rowSource` matches the `RowSource` type and leaves `rows` free for a future getter
of resolved rows.

### Published types (S4)

`Field`, `FieldSource`, `FieldType`, `FieldKey`, `FieldContext`, `Aggregator`, `GridColumn`, `GridColumnInput`,
`RowSource`, `EntriesRowSource`, `GroupRowSource`, `CustomRowSource`, `CustomRow`,
`RowSourceCommon`, `RowHeightMode`, `CustomRowInput`,
`CollapseChange`, `DatasetHierarchy`, `SerializedField`, and the S4 error classes re-exported from
`freegantt`.

## S5 (plugins)

FreeGantt takes one plugin type with two halves (ADR 0019). `definePlugin`
writes it: a `data` half installs on a `Dataset`, a `view`-only half installs on
a `Gantt`. Install at construction (`plugins: [...]`), or reconfigure a `Gantt`'s
plugins live (`gantt.plugins = [...]`). `docs/06-plugin-authoring.md` covers both
halves, every registration seam, the registration gate, disposal, `requires`, and
the errors an author meets. `tooltips()`, `contextMenu()`, and
`inlineEditing()` are the three built-in plugins that ship with the package,
none of them loaded unless a consumer installs them.

## Theming — the level-1 `--fg-*` token reference

`plans/02-public-api.md` §4 states the customization ladder as a design decision: level 1 is CSS
custom properties, and a consumer stops there when it is enough. This section is the reference that
statement points at — every `--fg-*` token the base stylesheet (`src/view/styles.ts`) reads, its
light and dark default, and what reads it. It moved here from `plans/02` §4 (issue #221 question 1):
a value list goes stale faster than a design decision does, so it lives beside the rest of the
consumer surface instead of inside the spec.

The whole base stylesheet ships inside one cascade layer, `@layer freegantt` (ADR 0021). Your own
CSS rule wins over the library's, at any specificity, with no `!important` — the library's sheet
never needs to be beaten by writing a longer selector than it did.

A consumer with no CSS of its own gets these defaults. Every one is overridable by setting the same
property on the container element, which the stylesheet's own `var(--fg-token, default)` always
prefers over its fallback (U4). A pixel metric is read through one shared reader
(`render/dom/pixel-property.ts`): computed value → px → validated → library default. A colour or
shadow token is a plain CSS custom property the base stylesheet's own class rules consume directly —
no JS reads it.

### Structural and pixel tokens

| Token | Default | Read by |
|---|---|---|
| `--fg-row-height` | `36px` | `pixel-property.ts`, re-read on every pane measurement |
| `--fg-grid-pane-width` | `160px` | `pixel-property.ts`, read once at construction |
| `--fg-splitter-width` | `4px` | `pixel-property.ts` |
| `--fg-band-height` | `24px` | `.fg-band` / `.fg-tick` CSS (`--fg-header-height` retired, S1.12 — see below) |
| `--fg-tick-box-floor` | `9px` | `.fg-tick` padding calc + `pixel-property.ts` into `LayoutInput.tickBoxFloorPx` |
| `--fg-bar-min-width` | `12px` | `pixel-property.ts` into `LayoutInput.minBarWidthPx` — every bar's painted-span floor; `FrameBar.span: 'minimum'` / `data-span="minimum"` mark a bar this floor touched. An Item that carries its own `box` (ADR 0022) skips this floor entirely — `FrameBar.span: 'fixed'` / `data-span="fixed"` mark it instead, and its width is the box's own `widthPx`, never this token |
| `--fg-bar-height` | `18px` | `pixel-property.ts` into `LayoutInput.barHeightPx` — a bar's own painted height, independent of `--fg-row-height`; centres in its row/lane band |
| `--fg-bar-radius` | `4px` | `.fg-bar` CSS rule directly (not `pixel-property.ts` — a border-radius, not a layout number) |
| `--fg-column-width` | `120px` | `column-chrome.ts`, re-read on every column rebind — the width a column takes when neither its own `width` nor its Field's `column.width` names one (#139) |
| `--fg-column-min-width` | `40px` | `column-chrome.ts` — floors how far a resize drag or a keyboard step can shrink a column |
| `--fg-column-resizer-hit` | `12px` | `.fg-column-resizer::before` — widens the resize grip's pointer hit target only; the visible grip stays 6px, and no JS reads this token |
| `--fg-cell-padding-inline` | `10px` | `.fg-col-header`, `.fg-row-label`, `.fg-row-cell` — the one pair a header cell and a row cell both read, so grid text never sits flush against a column's edge |
| `--fg-cell-padding-block` | `4px` | `.fg-col-header`, `.fg-row-label`, `.fg-row-cell` |
| `--fg-indent-width` | `12px` | `.fg-row-label` indent calc, `.fg-row-twisty` width — one hierarchy-depth step |
| `--fg-lane-gap` | `2px` | `.fg-container` declaration + `pixel-property.ts` into `LayoutInput.laneGapPx`, re-read on every pane measurement — gap between a row's packed lanes (`rowSource.heightMode: 'pack'`) |
| `--fg-bar-label-gap` | `8px` | `pixel-property.ts`, read once at `mount()` — `.fg-bar-label` inline padding, and the gap between a bar's right edge and an outside label (J1) |

### Colour and shadow tokens

| Token | Default (light) | Default (dark) | Read by |
|---|---|---|---|
| `--fg-pane-bg` | `#FFFFFF` | `#1B1D22` | `.fg-grid-pane`, `.fg-timeline-pane` background |
| `--fg-splitter-color` | `#E6E2D9` | `#2B2F36` | `.fg-splitter` background |
| `--fg-header-bg` | `#FFFFFF` | `#1B1D22` | `.fg-header` background |
| `--fg-header-band-bg` | `#F4F2EC` | `#22252B` | `.fg-band` background |
| `--fg-header-text` | `#1A1815` | `#ECEAE3` | `.fg-band`/`.fg-tick` text |
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
| `--fg-bar-label-outside-color` | `#5E5A53` | `#A8A49B` | `.fg-bar[data-label='outside'] .fg-bar-label` — a label pushed past the bar's own edge paints on the pane, so it takes the pane's own ink family instead of `--fg-bar-label-color` (J1) |
| `--fg-warn` | `#B4690E` | `#E0A340` | `.fg-bar[data-flag~="conflict"]` outline; the invalid cell editor's ring and discard button; `.fg-cell-notice`'s border and text |
| `--fg-date-line-color` | `#C93820` | `#FF6F57` | `.fg-date-line`, `.fg-date-line-label`, `.fg-cursor-line`, `.fg-cursor-line-label` |
| `--fg-date-line-label-color` | `#FFFFFF` | `#1B1D22` | `.fg-date-line-label`, `.fg-cursor-line-label` text — the chip's own ink, paired with `--fg-date-line-color` as its fill |
| `--fg-hover-ring` | `rgb(26 24 21 / 0.22)` | `rgb(236 234 227 / 0.26)` | `.fg-bar[data-state~="hovered"]` — the hovered bar's inset hairline |
| `--fg-drag-shadow` | `0 2px 0 rgb(26 24 21 / 0.18)` | `0 2px 0 rgb(0 0 0 / 0.45)` | `.fg-bar[data-state~="dragging"]` — the dragged bar's lift |
| `--fg-selection-color` | `oklch(0.55 0.13 245)` | `oklch(0.72 0.13 245)` | `.fg-bar[data-state~="selected"]` outline, offset 2px off the bar (pending uses the same token, dotted); the column reorder drop indicator; the open cell editor's ring |
| `--fg-ghost-opacity` | `0.4` | — | `.fg-bar[data-state~="ghost"]` |
| `--fg-pending-opacity` | `0.6` | — | `.fg-bar[data-state~="pending"]` |
| `--fg-focus-ring` | `oklch(0.55 0.20 305)` | `oklch(0.76 0.17 305)` | the roving-focus outline shared by both panes, a grid row/cell, a column header cell, a bar, and the splitter (`:focus-visible`) — its own hue, so a keyboard focus never reads as a selection or a conflict |
| `--fg-popup-bg` | `#FFFFFF` | `#22252B` | `.fg-popup` background — the shared surface `tooltips()`, `contextMenu()`, and the reorder drag wash draw from |
| `--fg-popup-border` | `#E6E2D9` | `#3A3F48` | `.fg-popup` border |
| `--fg-popup-shadow` | `0 8px 24px rgb(26 24 21 / 0.12)` | `0 10px 28px rgb(0 0 0 / 0.5)` | `.fg-popup` box-shadow; also the grabbed header cell's lifted shadow during a column reorder drag |

Colour defaults are sourced from an existing, unnamed palette this team maintains elsewhere — only
the *values* cross over, never the palette's name (CLAUDE.md: vendor product names never appear in
specs, docs, or code). `theme: 'auto' | 'light' | 'dark'` (default `'auto'`) selects which block
applies. Resolution runs in one order, the same inside `.fg-container` and outside it: the nearest
`data-fg-theme` pin, on the element or any ancestor, wins first; else `prefers-color-scheme`
(`:root:not([data-fg-theme])`) decides; else the light default on `:root` applies. `'auto'` writes
no `data-fg-theme` attribute, so it is the state that lets an ancestor's pin, or failing that the
system's, reach the Gantt. `'light'`/`'dark'` write the attribute on the container, which is the
nearest pin there can be to it, so a pin always wins over an ancestor's pin or the media query — on
document order at equal specificity, not because either attribute rule is more specific than the
other. The two attribute blocks select on `[data-fg-theme='light'|'dark']` alone, not on
`.fg-container`, so a consumer can put the same attribute on a wrapper around its own chrome — a
toolbar above the Gantt — and every `--fg-*` there means what it means inside; `.fg-container`
itself declares no colour of its own, so nothing on it blocks that inheritance. The library writes
the attribute on its own container only; mirroring it onto anything else is the consumer's own call.
No named
multi-preset picker beyond light/dark yet — that needs `extensions/`'s `PluginContext`, the only
I2-safe place a `registerThemePreset`-shaped seam can live.

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

Five `--fg-*` properties are the library's own plumbing, not a consumer's to set. Four are geometry
the library writes inline, per element, because a stylesheet rule alone cannot express it — setting
one by hand fights the next frame, which overwrites it. The fifth, `--fg-bar-fill-painted`, is
different: the base stylesheet computes it on `.fg-bar` itself, from `--fg-bar-fill` and
`--fg-bar-opacity` (see the note above) — a consumer sets the two colour tokens that feed it, never
this one.

| Token | Written by | Read by |
|---|---|---|
| `--fg-col-flex` | `render/dom/index.ts`, per column header/cell — the column's own flex-grow, or removed for a fixed column | `.fg-col-header`, `.fg-row-label`, `.fg-row-cell` `flex` |
| `--fg-grid-content-width` | `pane-layout.ts`, on the grid pane — how far a fixed-width column set overflows the pane (#126) | `.fg-grid-spacer`, `.fg-rows-clip` `width` (falls back to `100%`) |
| `--fg-row-depth` | `render/dom/index.ts`, per row — the row's hierarchy depth | `.fg-row-label` indent calc (with `--fg-indent-width`, above) |
| `--fg-popup-max-height` | `popup.ts`, on the popup wrapper — the anchor pane's height minus the popup's 1px top and bottom border (#280) | `.fg-popup` `max-height` (falls back to `none`) |
| `--fg-bar-fill-painted` | `.fg-bar`'s own CSS rule (`styles.ts`), computed from `--fg-bar-fill` and `--fg-bar-opacity` | `.fg-bar` background |

### Retired and renamed tokens

- **`--fg-header-height`** shipped at S1.8 (fallback `20`) and retired at S1.12 (D-S1.12-10) — a
  fixed header height could not size N header bands correctly. Migration: `--fg-header-height: 40px`
  on a two-band preset becomes `--fg-band-height: 20px`. The grid pane's spacer now mirrors one empty
  `.fg-band` per header band, so both panes size from `--fg-band-height` alone. `src/view/styles.test.ts`
  asserts the retired name is gone from the stylesheet.
- **`--fg-row-label-width`** was renamed to `--fg-grid-pane-width` at S1.8 — the gutter became a pane
  width, not a backend reservation. No file under `src/` still reads the old name.

## Harness demos

Run `pnpm dev` and open `http://localhost:5173`.

| Page | Demonstrates |
| --- | --- |
| `harness/index.html` | Tree `rowSource`, `gridColumns`, field rollup (`cost`), live row-source switch, selection, timeline toolbar |
| `harness/data.html` | Transactions, undo/redo, `change` events |

Internal module maps under `harness/docs/` are for maintainers and may lag the current slice, with
one exception: [`harness/docs/api-reference.html`](../harness/docs/api-reference.html) renders the
committed `etc/freegantt.api.md` and never drifts from it (D-S5-29).
