# Interface: GanttOptionsBase\<TProps\>

Defined in: api/gantt.ts:85

## Type Parameters

### TProps

`TProps` = `unknown`

## Properties

### a11yLabel?

> `optional` **a11yLabel?**: `string`

Defined in: api/gantt.ts:109

Live (S1.10). Default `'Gantt'`; sets `aria-label` on the container.

***

### barLabels?

> `optional` **barLabels?**: [`BarLabels`](../type-aliases/BarLabels.md)

Defined in: api/gantt.ts:153

Live (J1). Where the default bar label paints — ignored once `barRenderer`'s output takes over
 a bar's content. `'fitBar'` (the default): inside when the label fits, outside to the right of
 the bar when it does not, ellipsised inside as the last resort. `'inside'`/`'outside'` force one
 side, and still fall back to ellipsised-inside when the forced side has no room. `'none'` paints
 no label at all.

***

### barRenderer?

> `optional` **barRenderer?**: [`BarRenderer`](../type-aliases/BarRenderer.md)

Defined in: api/gantt.ts:166

Live (S5.4, D-S5-11). Customization ladder level 3 (`plans/02` §4). One function, over every
 bar **no variant paints**. `undefined` returned from it keeps the library's own bar output.

 A rule that names the rows it covers answers first, and the library's own summary rule is such
 a rule (`J40`, `J61`). So this never paints a row with children, which the library paints as a
 summary. To paint those too, claim them with a rule of your own:
 `variants: [{ name: 'summary', when: (entry) => entry.hasChildren, paint }]` — a consumer's
 rule outranks the library's.

 To paint one kind of row and leave the rest alone, write a variant instead: `variants: [{ name,
 when, paint }]` (ADR 0018). That is what the retired per-kind map form was for, and a variant
 says which rows it covers in the same object.

***

### cellRenderer?

> `optional` **cellRenderer?**: [`CellRenderer`](../type-aliases/CellRenderer.md)

Defined in: api/gantt.ts:184

Live (S5.4, D-S5-11). Gantt-wide; a per-column `GridColumn.cellRenderer` (S5.7) wins over this
 for its own column. `ctx.column.field` lets one function branch per column.

***

### collapsed?

> `optional` **collapsed?**: readonly (`string` \| [`RowId`](../type-aliases/RowId.md))[]

Defined in: api/gantt.ts:147

Live (S4.6, D-S4-22). Collapsed row ids, loose on the way in. Default `[]`.

***

### container

> **container**: `string` \| `HTMLElement`

Defined in: api/gantt.ts:88

Element or CSS selector (plans/02 §2) — resolved by GanttShell; a selector matching nothing
throws (#38).

***

### dataset

> **dataset**: [`Dataset`](../classes/Dataset.md)\<`TProps`\>

Defined in: api/gantt.ts:92

The Dataset this Gantt reads and writes, for its whole life. It binds `TProps`:
 a Gantt built on a `Dataset<{ team: string }, { cost: number }>` hands that same typed
 Dataset back from `gantt.dataset`, so a page never carries the pair by hand (#226).

***

### dateLines?

> `optional` **dateLines?**: readonly [`DateLineInput`](DateLineInput.md)[]

Defined in: api/gantt.ts:119

Live (S1.13, D-S1.13-4). Default `[]`. Extra Date lines beside the today wrapper —
 status/as-of dates, sprint or holiday markers, project start/finish. No id: index-keyed, like
 Header bands. The wrapper's own line never gets a Date line label; give one of these a `label` instead.

***

### gridColumns?

> `optional` **gridColumns?**: readonly [`GridColumnInput`](../type-aliases/GridColumnInput.md)[]

Defined in: api/gantt.ts:143

Live (S4.3, D-S4-12). Field keys in display order, plus per-Gantt overrides. Default `['name']`.

***

### gridWidth?

> `optional` **gridWidth?**: [`GridWidth`](../type-aliases/GridWidth.md)

Defined in: api/gantt.ts:101

Live. The grid pane's width in px (S1.8), or `'fitColumns'` (#157) to sit it on its columns'
 own right edge and keep it there as the columns change. Reads back in px either way. Default:
 `--fg-grid-pane-width`, fallback 160. Never wider than the columns (#139); a splitter drag
 turns `'fitColumns'` back into the width it was dragged to.

***

### headerRenderer?

> `optional` **headerRenderer?**: [`HeaderRenderer`](../type-aliases/HeaderRenderer.md)

Defined in: api/gantt.ts:186

Live (S5.4, D-S5-11). Grid column header chrome (S5.7 paints through it).

***

### interactions?

> `optional` **interactions?**: [`Interactions`](Interactions.md)

Defined in: api/gantt.ts:134

Live (S3, D-S3-9). A gesture rule is a boolean or a per-entry predicate; `edit` takes the cell
 and may answer "no opinion" (#256). Both sit over the per-kind default
 table. Default `{}`: every gesture resolves off the default table alone. Assignment replaces
 the whole config; `gantt.setCapabilityRule`/`clearCapabilityRule` write one rule (D-S5-35).

***

### locale?

> `optional` **locale?**: `LocalesArgument`

Defined in: api/gantt.ts:112

Live (S1.12, D-S1.12-12). `undefined` = the runtime default. Feeds header labels and
 screen-reader dates alike, with no bar remount.

***

### minGridWidth?

> `optional` **minGridWidth?**: `number`

Defined in: api/gantt.ts:105

Live (#127). The floor a splitter drag clamps `gridWidth` to. Default `40` — wide enough for
 one narrow column, so a drag cannot take the pane to nothing by accident. It bounds the drag
 only: an explicit `gridWidth = 0` still collapses the grid pane on purpose.

***

### plugins?

> `optional` **plugins?**: readonly [`ChromePlugin`](../type-aliases/ChromePlugin.md)\<`TProps`\>[]

Defined in: api/gantt.ts:199

Live (S5.1, D-S5-1, D-S5-3). Values a consumer imports (`tooltips()`, `contextMenu({...})`),
 never names in a table. Assignment diffs by `id`: a plugin present before and after is left
 alone, even when the new array holds a fresh object for that `id` — same id, new object is
 ignored (a dev build warns; production stays silent). Reconfigure with two assignments
 (remove, then add) or a distinct id. Default `[]`. `gantt.installPlugin`/`uninstallPlugin`
 add or drop one plugin without restating the set (D-S5-36).

 ADR 0019: chrome only. A plugin with a `data` half declares a Field or claims the edit hook, and
 both must be in place before the Dataset's first Rollup — so it installs on the `Dataset`
 instead. `data?: never` on this arm is what stops the wrong one compiling here.

***

### rowSource?

> `optional` **rowSource?**: [`RowSource`](../type-aliases/RowSource.md)

Defined in: api/gantt.ts:145

Live (S4.6, D-S4-21). Default `{ source: 'entries', tree: false }`.

***

### scroll?

> `optional` **scroll?**: [`ScrollModel`](../classes/ScrollModel.md)

Defined in: api/gantt.ts:96

Bound scroll object (D9) — pass the same instance to two Gantt instances to scroll-sync them.
Independent of `scale`/`preset`/`range`/`fit`: a Gantt may share its scroll position, its axis,
both, or neither.

***

### selectedSegmentIds?

> `optional` **selectedSegmentIds?**: readonly (`string` \| [`SegmentId`](../type-aliases/SegmentId.md))[]

Defined in: api/gantt.ts:129

Live (S3, D-S3-10; ADR 0010, #212). Segment ids, loose on the way in; assignment runs the same
 cancelable sequence a click runs. Default `[]`.

***

### snap?

> `optional` **snap?**: [`SnapSetting`](../type-aliases/SnapSetting.md)

Defined in: api/gantt.ts:138

Live (D-S3-24). What a drag and a keyboard nudge snap to: `{ unit, increment }`, `'tick'` for
 one tick of whatever preset is showing, or `'none'`. Omitted, the showing preset's own `snap`
 decides — which is `'tick'` for every shipped preset.

***

### theme?

> `optional` **theme?**: [`Theme`](../type-aliases/Theme.md)

Defined in: api/gantt.ts:107

Live (S1.10). Default `'auto'`: follows `prefers-color-scheme`.

***

### todayLine?

> `optional` **todayLine?**: `boolean` \| [`InstantInput`](../type-aliases/InstantInput.md)

Defined in: api/gantt.ts:115

Live (S1.12/S1.13, D-S1.12-14, D-S1.13-4). Default `true`: `now()`. `false`: off. An instant
 pins it with no clock read. To keep today visible, pan with `panToToday()` or grow `range`.

***

### todayLineMarginTicks?

> `optional` **todayLineMarginTicks?**: `number`

Defined in: api/gantt.ts:123

Live. How many of the current preset's own ticks `panToToday()` leaves between the pane's left
 edge and where it lands `align: 'start'` (the default) — the **Today line margin** (CONTEXT.md).
 Default `2`; `0` restores the old flush landing. No effect on `align: 'center'`.

***

### tooltipRenderer?

> `optional` **tooltipRenderer?**: [`TooltipRenderer`](../type-aliases/TooltipRenderer.md)

Defined in: api/gantt.ts:188

Live (S5.4, D-S5-11). Replaces a tooltip's body (S5.5's `tooltips()` feature).

***

### variants?

> `optional` **variants?**: readonly [`EntryVariant`](EntryVariant.md)\<`TProps`\>[]

Defined in: api/gantt.ts:181

Live (ADR 0018). One variant is one object: `when` says which rows wear it, `items` what shape
 it draws, `paint` how it looks, and `can` what you can do to it.

 ```ts
 variants: [{ name: 'milestone', when: { milestone: true }, paint: milestoneBar, can: { resize: false } }]
 ```

 Nothing stores a variant. It is a rule, resolved per Gantt, so two Gantts on one Dataset may
 paint the same row differently (I2). To pin one named row, write the data — declare a Field,
 `update(id, { milestone: true })`, and let `when` read it back.

 The rules here win over every plugin's, whatever order the plugins installed in, and both win
 over core's own `parent`/`leaf`. Of two rules on this list that both answer yes for one row,
 the later one wins. Default `[]`.

***

### viewportGestures?

> `optional` **viewportGestures?**: [`ViewportGestures`](../type-aliases/ViewportGestures.md)

Defined in: api/gantt.ts:141

Live (S3.7, D-S3-14). Wheel zoom, shift+wheel pan, and keyboard pan. Default `{}`: every
 viewport gesture is on. `false` turns them all off. Does not gate `zoomBy` / `panToDate`.

***

### zoomPresets?

> `optional` **zoomPresets?**: readonly [`PresetRef`](../type-aliases/PresetRef.md)[]

Defined in: api/gantt.ts:126

The ordered set `zoomIn`/`zoomOut` step through, finest first (S1.12, D-S1.12-5). Live.
 Default: the shipped nine-rung set.
