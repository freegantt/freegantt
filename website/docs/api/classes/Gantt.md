# Class: Gantt\<TProps\>

Defined in: api/gantt.ts:265

## Type Parameters

### TProps

`TProps` = `unknown`

## Constructors

### Constructor

> **new Gantt**\<`TProps`\>(`options`): `Gantt`\<`TProps`\>

Defined in: api/gantt.ts:273

#### Parameters

##### options

[`GanttOptions`](../type-aliases/GanttOptions.md)\<`TProps`\>

#### Returns

`Gantt`\<`TProps`\>

## Accessors

### a11yLabel

#### Get Signature

> **get** **a11yLabel**(): `string`

Defined in: api/gantt.ts:422

##### Returns

`string`

#### Set Signature

> **set** **a11yLabel**(`value`): `void`

Defined in: api/gantt.ts:426

##### Parameters

###### value

`string`

##### Returns

`void`

***

### barLabels

#### Get Signature

> **get** **barLabels**(): [`BarLabels`](../type-aliases/BarLabels.md)

Defined in: api/gantt.ts:480

Live (J1). `gantt.barLabels = 'outside'`. Where the default bar label paints — ignored once
 `barRenderer`'s own output takes over a bar's content. Default `'fitBar'`.

##### Returns

[`BarLabels`](../type-aliases/BarLabels.md)

#### Set Signature

> **set** **barLabels**(`value`): `void`

Defined in: api/gantt.ts:484

##### Parameters

###### value

[`BarLabels`](../type-aliases/BarLabels.md)

##### Returns

`void`

***

### barRenderer

#### Get Signature

> **get** **barRenderer**(): [`BarRenderer`](../type-aliases/BarRenderer.md) \| `undefined`

Defined in: api/gantt.ts:489

Live (S5.4, D-S5-11). Assigning repaints every bar with no remount (I8).

##### Returns

[`BarRenderer`](../type-aliases/BarRenderer.md) \| `undefined`

#### Set Signature

> **set** **barRenderer**(`renderer`): `void`

Defined in: api/gantt.ts:493

##### Parameters

###### renderer

[`BarRenderer`](../type-aliases/BarRenderer.md) \| `undefined`

##### Returns

`void`

***

### canZoomIn

#### Get Signature

> **get** **canZoomIn**(): `boolean`

Defined in: api/gantt.ts:775

##### Returns

`boolean`

***

### canZoomOut

#### Get Signature

> **get** **canZoomOut**(): `boolean`

Defined in: api/gantt.ts:779

##### Returns

`boolean`

***

### cellRenderer

#### Get Signature

> **get** **cellRenderer**(): [`CellRenderer`](../type-aliases/CellRenderer.md) \| `undefined`

Defined in: api/gantt.ts:529

Live (S5.4, D-S5-11). Assigning repaints every cell with no remount (I8).

##### Returns

[`CellRenderer`](../type-aliases/CellRenderer.md) \| `undefined`

#### Set Signature

> **set** **cellRenderer**(`renderer`): `void`

Defined in: api/gantt.ts:533

##### Parameters

###### renderer

[`CellRenderer`](../type-aliases/CellRenderer.md) \| `undefined`

##### Returns

`void`

***

### collapsed

#### Get Signature

> **get** **collapsed**(): readonly [`RowId`](../type-aliases/RowId.md)[]

Defined in: api/gantt.ts:578

##### Returns

readonly [`RowId`](../type-aliases/RowId.md)[]

#### Set Signature

> **set** **collapsed**(`ids`): `void`

Defined in: api/gantt.ts:582

##### Parameters

###### ids

readonly (`string` \| [`RowId`](../type-aliases/RowId.md))[]

##### Returns

`void`

***

### commands

#### Get Signature

> **get** **commands**(): [`CommandRegistry`](../type-aliases/CommandRegistry.md)\<`TProps`\>

Defined in: api/gantt.ts:873

S5.2, D-S5-6: the one command registry. `freegantt.*` is the core namespace — core registers
 its own commands (collapse/expand, zoom, pan, selection, undo/redo, and keyboard navigation)
 before any plugin, so a plugin's own registration always wins for a shared id (D-S5-7).
 `run(id)` silently no-ops when the command's `when` declines, the same posture as a disabled
 menu item. Read-only — `register` lives on the registry itself.

##### Returns

[`CommandRegistry`](../type-aliases/CommandRegistry.md)\<`TProps`\>

***

### dataset

#### Get Signature

> **get** **dataset**(): [`Dataset`](Dataset.md)\<`TProps`\>

Defined in: api/gantt.ts:410

The Dataset this Gantt was built on (#226). Call: `gantt.dataset.canUndo`, or
 `gantt.dataset.on('change', …)`. It carries the consumer's own `TProps`, so a helper
 that needs both objects takes the Gantt alone — `mountGanttToolbar({ gantt, container })` —
 instead of taking the pair and trusting the caller to keep it matched.

 Read-only on purpose. A Gantt binds its Dataset once, at construction: the shell seeds its
 viewport from those entries, subscribes to that Dataset's `change`, and hands it to every
 plugin and command context. Swapping it is a new capability — teardown and rebind of all of
 that — not a getter's mirror, so it stays out until something asks for it. Build a second
 Gantt instead.

##### Returns

[`Dataset`](Dataset.md)\<`TProps`\>

***

### dateLines

#### Get Signature

> **get** **dateLines**(): readonly [`DateLine`](../interfaces/DateLine.md)[]

Defined in: api/gantt.ts:674

Getter returns what was resolved (S4-1), same precedent as `todayLine`/`range` above: every
 `placeAt` reads back an `Instant`, so `diffMs(gantt.dateLines[0].placeAt, now())` type-checks
 with no re-narrowing.

##### Returns

readonly [`DateLine`](../interfaces/DateLine.md)[]

#### Set Signature

> **set** **dateLines**(`lines`): `void`

Defined in: api/gantt.ts:680

Live (S1.13, D-S1.13-4). Loose on the way in: every `placeAt` is read through the dataset's
 zone via `toInstant`.

##### Parameters

###### lines

readonly [`DateLineInput`](../interfaces/DateLineInput.md)[]

##### Returns

`void`

***

### fit

#### Get Signature

> **get** **fit**(): [`TimeScaleFit`](../type-aliases/TimeScaleFit.md)

Defined in: api/gantt.ts:641

##### Returns

[`TimeScaleFit`](../type-aliases/TimeScaleFit.md)

#### Set Signature

> **set** **fit**(`f`): `void`

Defined in: api/gantt.ts:645

##### Parameters

###### f

[`TimeScaleFit`](../type-aliases/TimeScaleFit.md)

##### Returns

`void`

***

### gridColumns

#### Get Signature

> **get** **gridColumns**(): readonly [`GridColumnInput`](../type-aliases/GridColumnInput.md)[]

Defined in: api/gantt.ts:448

##### Returns

readonly [`GridColumnInput`](../type-aliases/GridColumnInput.md)[]

#### Set Signature

> **set** **gridColumns**(`columns`): `void`

Defined in: api/gantt.ts:452

##### Parameters

###### columns

readonly [`GridColumnInput`](../type-aliases/GridColumnInput.md)[]

##### Returns

`void`

***

### gridWidth

#### Get Signature

> **get** **gridWidth**(): `number`

Defined in: api/gantt.ts:430

##### Returns

`number`

#### Set Signature

> **set** **gridWidth**(`width`): `void`

Defined in: api/gantt.ts:436

Live. `'fitColumns'` stands until something else sets a width — a later assignment, or a
 splitter drag (#157).

##### Parameters

###### width

[`GridWidth`](../type-aliases/GridWidth.md)

##### Returns

`void`

***

### headerRenderer

#### Get Signature

> **get** **headerRenderer**(): [`HeaderRenderer`](../type-aliases/HeaderRenderer.md) \| `undefined`

Defined in: api/gantt.ts:538

Live (S5.4, D-S5-11).

##### Returns

[`HeaderRenderer`](../type-aliases/HeaderRenderer.md) \| `undefined`

#### Set Signature

> **set** **headerRenderer**(`renderer`): `void`

Defined in: api/gantt.ts:542

##### Parameters

###### renderer

[`HeaderRenderer`](../type-aliases/HeaderRenderer.md) \| `undefined`

##### Returns

`void`

***

### hiddenGridColumns

#### Get Signature

> **get** **hiddenGridColumns**(): readonly [`FieldKey`](../type-aliases/FieldKey.md)[]

Defined in: api/gantt.ts:458

D-S5-34: which columns are hidden, by field key — what a column chooser reads to draw its own
 checkboxes. Reports the columns this Gantt was configured with, never a plugin's own.

##### Returns

readonly [`FieldKey`](../type-aliases/FieldKey.md)[]

***

### interactions

#### Get Signature

> **get** **interactions**(): [`Interactions`](../interfaces/Interactions.md)

Defined in: api/gantt.ts:738

Live (S3, D-S3-9): re-resolves immediately, so a stricter rule hides a handle or refuses a
 gesture without waiting for the next pointer move.

##### Returns

[`Interactions`](../interfaces/Interactions.md)

#### Set Signature

> **set** **interactions**(`next`): `void`

Defined in: api/gantt.ts:742

##### Parameters

###### next

[`Interactions`](../interfaces/Interactions.md)

##### Returns

`void`

***

### locale

#### Get Signature

> **get** **locale**(): `LocalesArgument`

Defined in: api/gantt.ts:649

##### Returns

`LocalesArgument`

#### Set Signature

> **set** **locale**(`l`): `void`

Defined in: api/gantt.ts:655

Live (S1.12, D-S1.12-12): every header label and every screen-reader date re-reads in the new
 locale, live, with no remount.

##### Parameters

###### l

`LocalesArgument`

##### Returns

`void`

***

### minGridWidth

#### Get Signature

> **get** **minGridWidth**(): `number`

Defined in: api/gantt.ts:440

##### Returns

`number`

#### Set Signature

> **set** **minGridWidth**(`px`): `void`

Defined in: api/gantt.ts:444

##### Parameters

###### px

`number`

##### Returns

`void`

***

### plugins

#### Get Signature

> **get** **plugins**(): readonly [`ChromePlugin`](../type-aliases/ChromePlugin.md)\<`TProps`\>[]

Defined in: api/gantt.ts:836

Live (S5.1, D-S5-1, D-S5-3). See `GanttOptions.plugins`. This Gantt's own chrome plugins, and
 only those: a plugin installed on the Dataset stays off this list, because this Gantt cannot
 drop it (ADR 0019).

##### Returns

readonly [`ChromePlugin`](../type-aliases/ChromePlugin.md)\<`TProps`\>[]

#### Set Signature

> **set** **plugins**(`next`): `void`

Defined in: api/gantt.ts:840

##### Parameters

###### next

readonly [`ChromePlugin`](../type-aliases/ChromePlugin.md)\<`TProps`\>[]

##### Returns

`void`

***

### preset

#### Get Signature

> **get** **preset**(): [`ViewPreset`](../interfaces/ViewPreset.md)

Defined in: api/gantt.ts:606

##### Returns

[`ViewPreset`](../interfaces/ViewPreset.md)

#### Set Signature

> **set** **preset**(`ref`): `void`

Defined in: api/gantt.ts:610

##### Parameters

###### ref

[`PresetRef`](../type-aliases/PresetRef.md)

##### Returns

`void`

***

### range

#### Get Signature

> **get** **range**(): [`TimeSpan`](../interfaces/TimeSpan.md) \| `"fitDataset"`

Defined in: api/gantt.ts:631

Getter returns the resolved `TimeSpan` — matching how `Dataset` reads `EntryInput` once at
 ingest (D-S1.12-8).

##### Returns

[`TimeSpan`](../interfaces/TimeSpan.md) \| `"fitDataset"`

#### Set Signature

> **set** **range**(`r`): `void`

Defined in: api/gantt.ts:637

Loose input (S1.12, D-S1.12-8): a string, a `Date`, an epoch number or an `Instant` all work on
 `start`/`end`, read through the dataset's zone.

##### Parameters

###### r

`"fitDataset"` \| \{ `end`: [`InstantInput`](../type-aliases/InstantInput.md); `start`: [`InstantInput`](../type-aliases/InstantInput.md); \}

##### Returns

`void`

***

### rowSource

#### Get Signature

> **get** **rowSource**(): [`ResolvedRowSource`](../type-aliases/ResolvedRowSource.md)

Defined in: api/gantt.ts:563

Live (S4.6, D-S4-21). Assigning re-resolves rows with no remount. The config object is a value
 (#187): assign a copy after a change, not the object already held.

 Reads back resolved (#248 S4-2): `filterPolicy` and `tree` (Entries sources) come back
 filled, never omitted — a reader never has to know `layout/`'s own defaults. The
 resolve runs here, cached against the setter's own authored object, so two reads with no write
 between them stay `===` and the setter keeps assigning the plain `RowSource` the shell already
 compares by identity (#187) — resolving inside that comparison would break it instead.

##### Returns

[`ResolvedRowSource`](../type-aliases/ResolvedRowSource.md)

#### Set Signature

> **set** **rowSource**(`next`): `void`

Defined in: api/gantt.ts:574

Loose on the way in, same as every other setter (#248 S4-2): stores the `RowSource` exactly as
 authored, so the shell's own `Object.is` re-assignment check keeps comparing what the caller
 actually passed.

##### Parameters

###### next

[`RowSource`](../type-aliases/RowSource.md)

##### Returns

`void`

***

### selectedEntries

#### Get Signature

> **get** **selectedEntries**(): readonly [`Entry`](../interfaces/Entry.md)\<`TProps`\>[]

Defined in: api/gantt.ts:727

The Selection as records — the bound dataset's `Entry` for each id in `selectedEntryIds`, in
 the same order. Re-reads the store on every access, so field edits show up without a selection
 change. An id that no longer exists in the store is skipped — for example after
 `dataset.entries.remove` left a stale id in the selection set. To change which entries are
 selected, assign `selectedSegmentIds`; this getter is read-only.

##### Returns

readonly [`Entry`](../interfaces/Entry.md)\<`TProps`\>[]

***

### selectedEntryIds

#### Get Signature

> **get** **selectedEntryIds**(): readonly [`EntryId`](../type-aliases/EntryId.md)[]

Defined in: api/gantt.ts:718

The Selection read as records rather than drawings (ADR 0010, #212) — the Entries the selected
 Segments belong to, deduped, in row order. Read-only: assign `selectedSegmentIds` to change what
 is selected, because a Segment is the unit the user actually points at.

##### Returns

readonly [`EntryId`](../type-aliases/EntryId.md)[]

***

### selectedSegmentIds

#### Get Signature

> **get** **selectedSegmentIds**(): readonly [`SegmentId`](../type-aliases/SegmentId.md)[]

Defined in: api/gantt.ts:707

The Selection itself (ADR 0010, #212) — which Segments a click, the keyboard, or an assignment
 selected. The pane a click lands in picks the unit: the timeline selects the Segment under the
 pointer, and the grid pane selects every Segment of every Entry the row owns. Loose in, branded
 out — the same asymmetry `dataset.entries.get/update/remove` already ship. Live: assignment runs
 the same cancelable `beforeSelectionChange` → `selectionChange` sequence a click runs.

##### Returns

readonly [`SegmentId`](../type-aliases/SegmentId.md)[]

#### Set Signature

> **set** **selectedSegmentIds**(`ids`): `void`

Defined in: api/gantt.ts:711

##### Parameters

###### ids

readonly (`string` \| [`SegmentId`](../type-aliases/SegmentId.md))[]

##### Returns

`void`

***

### snap

#### Get Signature

> **get** **snap**(): [`SnapSetting`](../type-aliases/SnapSetting.md)

Defined in: api/gantt.ts:617

D-S3-24. What a drag snaps to right now: this Gantt's own setting when it states one, else the
 showing preset's, else `'tick'`. A gesture resolves `'tick'` against the preset it measures, so
 the answer follows a zoom without the caller writing anything.

##### Returns

[`SnapSetting`](../type-aliases/SnapSetting.md)

#### Set Signature

> **set** **snap**(`next`): `void`

Defined in: api/gantt.ts:625

Live (D-S3-24). Call: `gantt.snap = { unit: 'day', increment: 2 }`. It states the snap for this
 Gantt, over whatever preset is showing, and it survives a zoom. `undefined` hands the answer
 back to the preset. The old spelling — `gantt.preset = { ...gantt.preset, snap }` — built a
 one-off copy of a shipped preset, and the next `zoomIn()` threw the snap away with it.

##### Parameters

###### next

[`SnapSetting`](../type-aliases/SnapSetting.md) \| `undefined`

##### Returns

`void`

***

### theme

#### Get Signature

> **get** **theme**(): [`Theme`](../type-aliases/Theme.md)

Defined in: api/gantt.ts:414

##### Returns

[`Theme`](../type-aliases/Theme.md)

#### Set Signature

> **set** **theme**(`value`): `void`

Defined in: api/gantt.ts:418

##### Parameters

###### value

[`Theme`](../type-aliases/Theme.md)

##### Returns

`void`

***

### todayLine

#### Get Signature

> **get** **todayLine**(): `boolean` \| [`Instant`](../type-aliases/Instant.md)

Defined in: api/gantt.ts:661

Getter returns what was resolved (S1.13, D-S1.13-4, S4-1) — a `boolean` passes straight
 through; any other setting reads back the `Instant` it was pinned to, never the loose input.

##### Returns

`boolean` \| [`Instant`](../type-aliases/Instant.md)

#### Set Signature

> **set** **todayLine**(`on`): `void`

Defined in: api/gantt.ts:667

Live (S1.12/S1.13, D-S1.12-14, D-S1.13-4). `true`/`false` pass straight through; any other
 `InstantInput` is read once through the dataset's zone and pins the line with no clock read.

##### Parameters

###### on

`boolean` \| [`InstantInput`](../type-aliases/InstantInput.md)

##### Returns

`void`

***

### todayLineMarginTicks

#### Get Signature

> **get** **todayLineMarginTicks**(): `number`

Defined in: api/gantt.ts:684

##### Returns

`number`

#### Set Signature

> **set** **todayLineMarginTicks**(`ticks`): `void`

Defined in: api/gantt.ts:689

Live. See `GanttOptions.todayLineMarginTicks`.

##### Parameters

###### ticks

`number`

##### Returns

`void`

***

### tooltipRenderer

#### Get Signature

> **get** **tooltipRenderer**(): [`TooltipRenderer`](../type-aliases/TooltipRenderer.md) \| `undefined`

Defined in: api/gantt.ts:547

Live (S5.4, D-S5-11).

##### Returns

[`TooltipRenderer`](../type-aliases/TooltipRenderer.md) \| `undefined`

#### Set Signature

> **set** **tooltipRenderer**(`renderer`): `void`

Defined in: api/gantt.ts:551

##### Parameters

###### renderer

[`TooltipRenderer`](../type-aliases/TooltipRenderer.md) \| `undefined`

##### Returns

`void`

***

### variants

#### Get Signature

> **get** **variants**(): readonly [`EntryVariant`](../interfaces/EntryVariant.md)\<`TProps`\>[]

Defined in: api/gantt.ts:503

Live (ADR 0018). Assigning replaces this Gantt's own variant list. Every row resolves its
 variant again, and a row whose rule no longer answers falls back to whatever wins next. A
 plugin's own variants stand, and they still lose to these.

 A variant list is a value, not a mutable object (#187): push onto the array you already
 assigned and nothing repaints. Assign a copy — `[...gantt.variants, myVariant]`.

##### Returns

readonly [`EntryVariant`](../interfaces/EntryVariant.md)\<`TProps`\>[]

#### Set Signature

> **set** **variants**(`next`): `void`

Defined in: api/gantt.ts:507

##### Parameters

###### next

readonly [`EntryVariant`](../interfaces/EntryVariant.md)\<`TProps`\>[]

##### Returns

`void`

***

### viewportGestures

#### Get Signature

> **get** **viewportGestures**(): [`ViewportGestures`](../type-aliases/ViewportGestures.md)

Defined in: api/gantt.ts:767

Live (S3.7, D-S3-14): the next wheel or key reads the new flags; no remount.

##### Returns

[`ViewportGestures`](../type-aliases/ViewportGestures.md)

#### Set Signature

> **set** **viewportGestures**(`next`): `void`

Defined in: api/gantt.ts:771

##### Parameters

###### next

[`ViewportGestures`](../type-aliases/ViewportGestures.md)

##### Returns

`void`

***

### zoomPresets

#### Get Signature

> **get** **zoomPresets**(): readonly [`ViewPreset`](../interfaces/ViewPreset.md)[]

Defined in: api/gantt.ts:694

The ordered set `zoomIn`/`zoomOut` step through, finest first (S1.12, D-S1.12-5). Live.

##### Returns

readonly [`ViewPreset`](../interfaces/ViewPreset.md)[]

#### Set Signature

> **set** **zoomPresets**(`refs`): `void`

Defined in: api/gantt.ts:698

##### Parameters

###### refs

readonly [`PresetRef`](../type-aliases/PresetRef.md)[]

##### Returns

`void`

## Methods

### clearCapabilityRule()

> **clearCapabilityRule**(`capability`): `void`

Defined in: api/gantt.ts:762

D-S5-35. Call: `gantt.clearCapabilityRule('resize')`. It takes this Gantt's own rule off one
 gesture, so a plugin's kind defaults and the library's per-kind table answer it again. This is
 not `setCapabilityRule('resize', true)`: `true` is a rule of its own, and it would also make a
 rolled-up parent and a milestone resizable. Clearing a gesture that carries no rule does
 nothing.

#### Parameters

##### capability

keyof [`Interactions`](../interfaces/Interactions.md)

#### Returns

`void`

***

### collapse()

> **collapse**(`id`): `void`

Defined in: api/gantt.ts:586

#### Parameters

##### id

`string` \| [`RowId`](../type-aliases/RowId.md)

#### Returns

`void`

***

### collapseAll()

> **collapseAll**(): `void`

Defined in: api/gantt.ts:598

#### Returns

`void`

***

### destroy()

> **destroy**(): `void`

Defined in: api/gantt.ts:885

#### Returns

`void`

***

### expand()

> **expand**(`id`): `void`

Defined in: api/gantt.ts:590

#### Parameters

##### id

`string` \| [`RowId`](../type-aliases/RowId.md)

#### Returns

`void`

***

### expandAll()

> **expandAll**(): `void`

Defined in: api/gantt.ts:602

#### Returns

`void`

***

### hasPlugin()

> **hasPlugin**(`plugin`): `boolean`

Defined in: api/gantt.ts:855

D-S5-36. Call: `gantt.hasPlugin('harness.logging')`. It answers whether that plugin is
 installed right now — what a toggle reads before it decides which verb to call. Identity is the
 `id`, so an object with an installed plugin's `id` answers `true`.

#### Parameters

##### plugin

`string` \| [`ChromePlugin`](../type-aliases/ChromePlugin.md)\<`TProps`\>

#### Returns

`boolean`

***

### hideGridColumn()

> **hideGridColumn**(`field`): `void`

Defined in: api/gantt.ts:468

D-S5-34. Call: `gantt.hideGridColumn('cost')`. It takes one column off the screen. It leaves
 every other column alone, with the width and the order the user gave them. The caller restates
 no list and splices nothing back later. The hidden column stays in `gridColumns` as
 `{ field, hidden: true }`, so a saved list restores it hidden. It raises the same cancelable
 `beforeGridColumnsChange`/`gridColumnsChange` pair a resize raises. It throws
 `UnknownGridColumnError` when no declared column names the field.

#### Parameters

##### field

[`FieldKey`](../type-aliases/FieldKey.md)

#### Returns

`void`

***

### installPlugin()

> **installPlugin**(`plugin`): `void`

Defined in: api/gantt.ts:848

D-S5-36. Call: `gantt.installPlugin(tooltips())`. It installs one plugin and leaves every
 plugin already running alone, so a caller never restates the installed set to add to it. A
 plugin whose `id` is already installed throws `DuplicatePluginIdError` — the assignment form
 ignores it and reports `plugin-reconfigure-dropped`, which is the silence this verb replaces.

#### Parameters

##### plugin

[`ChromePlugin`](../type-aliases/ChromePlugin.md)\<`TProps`\>

#### Returns

`void`

***

### off()

> **off**\<`K`\>(`name`, `handler`): `void`

Defined in: api/gantt.ts:881

#### Type Parameters

##### K

`K` *extends* keyof [`GanttEventMap`](../interfaces/GanttEventMap.md)

#### Parameters

##### name

`K`

##### handler

[`GanttEventHandler`](../type-aliases/GanttEventHandler.md)\<`K`\>

#### Returns

`void`

***

### on()

> **on**\<`K`\>(`name`, `handler`): `void`

Defined in: api/gantt.ts:877

#### Type Parameters

##### K

`K` *extends* keyof [`GanttEventMap`](../interfaces/GanttEventMap.md)

#### Parameters

##### name

`K`

##### handler

[`GanttEventHandler`](../type-aliases/GanttEventHandler.md)\<`K`\>

#### Returns

`void`

***

### panToDate()

> **panToDate**(`date`, `align?`): `void`

Defined in: api/gantt.ts:813

Pans so `date` sits at `align` within the pane (S1.12, D-S1.12-8). Loose input: a string, a
 `Date`, an epoch number or an `Instant` all work, read through the dataset's zone.

#### Parameters

##### date

[`InstantInput`](../type-aliases/InstantInput.md)

##### align?

`"start"` \| `"center"`

#### Returns

`void`

***

### panToToday()

> **panToToday**(`align?`): `void`

Defined in: api/gantt.ts:822

Pans to `now()` (`time/` owns the clock read, I10), leaving `todayLineMarginTicks`' worth of
 margin to the left at `align: 'start'` (the default) so the today line reads as "near the
 start" rather than sitting flush on the pane's own edge. `align: 'center'` is unaffected:
 already centred, a margin has nothing to add. Off the dataset's own range, `panTo`'s clamp
 (D-S1.5-2) lands at whichever edge is closest instead of throwing.

#### Parameters

##### align?

`"start"` \| `"center"`

#### Returns

`void`

***

### reveal()

> **reveal**(`id`): `void`

Defined in: api/gantt.ts:829

An `EntryId` reveals that Entry's whole envelope; a `SegmentId` reveals that one Segment alone.
 An id the Dataset reads as neither throws `RevealTargetNotFoundError` (ADR 0010, #227). A plain
 `string` is legal. The Dataset resolves the reading; nothing reads the brand.

#### Parameters

##### id

`string` \| [`EntryId`](../type-aliases/EntryId.md) \| [`SegmentId`](../type-aliases/SegmentId.md)

#### Returns

`void`

***

### setCapabilityRule()

> **setCapabilityRule**\<`K`\>(`capability`, `rule`): `void`

Defined in: api/gantt.ts:753

D-S5-35. Call: `gantt.setCapabilityRule('resize', false)`. It writes the rule for one gesture
 and leaves the rules for the others exactly as they are. `gantt.interactions = { resize: false }`
 drops them instead. A gesture rule is a boolean, or a predicate the resolver runs per entry —
 `gantt.setCapabilityRule('move', (entry) => entry.kind !== 'milestone')`. The `edit` rule is
 the one that takes a cell (#256): `gantt.setCapabilityRule('edit', (entry, field) => (field ===
 'end' ? false : undefined))`, where `undefined` leaves that cell to the rules below. It re-resolves at
 once, so a stricter rule hides a handle without waiting for the next pointer move.

#### Type Parameters

##### K

`K` *extends* keyof [`Interactions`](../interfaces/Interactions.md)

#### Parameters

##### capability

`K`

##### rule

`NonNullable`\<[`Interactions`](../interfaces/Interactions.md)\[`K`\]\>

#### Returns

`void`

***

### showGridColumn()

> **showGridColumn**(`field`): `void`

Defined in: api/gantt.ts:474

D-S5-34. Call: `gantt.showGridColumn('cost')`. Puts a hidden column back where it was, with the
 width it had. Showing a column that is already on screen changes nothing.

#### Parameters

##### field

[`FieldKey`](../type-aliases/FieldKey.md)

#### Returns

`void`

***

### toggleCollapse()

> **toggleCollapse**(`id`): `void`

Defined in: api/gantt.ts:594

#### Parameters

##### id

`string` \| [`RowId`](../type-aliases/RowId.md)

#### Returns

`void`

***

### uninstallPlugin()

> **uninstallPlugin**(`plugin`): `void`

Defined in: api/gantt.ts:864

D-S5-36. Call: `gantt.uninstallPlugin(popup)`, or `gantt.uninstallPlugin('harness.logging')`.
 It disposes that one plugin and leaves the rest running. Identity is the `id` in both forms,
 the same identity the assignment form diffs by (D-S5-3). A plugin nothing installs throws
 `PluginNotInstalledError`, so a misspelled id is not a silent no-op.

#### Parameters

##### plugin

`string` \| [`ChromePlugin`](../type-aliases/ChromePlugin.md)\<`TProps`\>

#### Returns

`void`

***

### variantFor()

> **variantFor**(`entry`): [`ResolvedVariant`](../interfaces/ResolvedVariant.md)

Defined in: api/gantt.ts:524

The whole variant this Gantt resolved for one row (ADR 0018, ADR 0022 §3) — one door, and it
 answers the object, never a name a caller looks up again (`itemsFor`/`paintFor` do not exist;
 `variantOf` retired for the same reason, review finding F3). Call:
 `gantt.variantFor(entry).name`, or read `.paint`/`.can`/`.css` off the same answer.

 Not `entry.variant`. An Entry belongs to a `Dataset`; a variant resolves per Gantt. I2 lets two
 Gantts on one Dataset paint the same row differently, so `entry.variant` would have to pick one
 answer and be wrong on the other Gantt.

 The parameter keeps `TProps`; the answer does not (F18) — `ResolvedVariant`'s own doc says why.

#### Parameters

##### entry

[`Entry`](../interfaces/Entry.md)\<`TProps`\>

#### Returns

[`ResolvedVariant`](../interfaces/ResolvedVariant.md)

***

### zoomBy()

> **zoomBy**(`factor`, `anchorX?`): `void`

Defined in: api/gantt.ts:799

#### Parameters

##### factor

`number`

##### anchorX?

`number`

#### Returns

`void`

***

### zoomIn()

> **zoomIn**(`anchorX?`): `void`

Defined in: api/gantt.ts:786

Next finer entry of `zoomPresets`; no-op at the finest (S1.12, D-S1.12-6). `anchorX` defaults
 to pane centre. Steps the preset only — under `fit: 'pane'`, density stays pane-fill until the
 floor bites.

#### Parameters

##### anchorX?

`number`

#### Returns

`void`

***

### zoomOut()

> **zoomOut**(`anchorX?`): `void`

Defined in: api/gantt.ts:791

Next coarser entry of `zoomPresets`; no-op at the coarsest (S1.12, D-S1.12-6).

#### Parameters

##### anchorX?

`number`

#### Returns

`void`

***

### zoomTo()

> **zoomTo**(`pxPerMs`, `anchorX?`): `void`

Defined in: api/gantt.ts:795

#### Parameters

##### pxPerMs

`number`

##### anchorX?

`number`

#### Returns

`void`

***

### zoomToSpan()

> **zoomToSpan**(`span`): `void`

Defined in: api/gantt.ts:806

Resolves the density that makes `span` exactly fill the pane, then pans so `span.start` sits at
 the pane's left edge — both inside one batch, one notification (S1.12, D-S1.12-7). Floored, so
 a span too long to be legible fills the pane only as far as the floor allows.

#### Parameters

##### span

###### end

[`InstantInput`](../type-aliases/InstantInput.md)

###### start

[`InstantInput`](../type-aliases/InstantInput.md)

#### Returns

`void`
