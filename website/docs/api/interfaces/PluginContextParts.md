# Interface: PluginContextParts\<TGantt, TDataset\>

Defined in: view/plugin-ports.ts:152

The parts of one plugin's `PluginContext` that `view/` owns — what `GanttShell` hands to
 `options.buildPluginContext` so it can build the whole thing (S5.1, D-S5-1). Declared in the
 groups a plugin reads, so `api/gantt.ts` adds the two api-level members and nothing else (#150).

 #183: `Parts`, not `Ports`. Every other `*Ports` in this repo is one collaborator's seam back
 into its owner (`ColumnChromePorts`, `GanttShellPorts` below). This is not that. It is the plugin's
 own world, minus the two members `view/` may not name. It is also the one name here a consumer
 reads, because `api/index.ts` exports it to keep the plugin surface member-by-member in
 `etc/freegantt.api.md` (#166, I11). `PlainParts` sets the suffix: the pieces a composite is
 made of.

 #166: this is **the** member list for the plugin surface. `api/plugin-context.ts`'s public
 `PluginContextOf` is `PluginContextParts<TGantt, TDataset>` plus `dataset` and `gantt`, and
 nothing else. It used to be a hand-typed copy of all twenty-five, doc comments included, with
 nothing checking the copy. So the doc a plugin author reads lives here now, beside the one
 declaration.

 #191: `TGantt`/`TDataset` are what `commands` and `registerKeybinding` bind. `api/plugin-context.ts`
 bound them instead. So this interface published two members that were wrong for every consumer,
 and `PluginContextOf` had to `Omit` both back out. Both arguments default to `unknown`. A caller
 that binds neither — `buildPluginPorts` below is the only one — reads the two members unbound.

 #155: every `register*` here returns a `Disposer` that removes exactly its own registration. The
 plugin's own `DisposableStore` already holds a copy, so a plugin that never calls it still
 disposes cleanly on uninstall. The return value is what lets a plugin retract a registration
 while it is still installed — a column it shows in one mode only. Calling it twice is safe.

## Type Parameters

### TGantt

`TGantt` = `unknown`

### TDataset

`TDataset` = `unknown`

## Properties

### commands

> **commands**: [`CommandRegistryOf`](CommandRegistryOf.md)\<`TGantt`, `TDataset`\>

Defined in: view/plugin-ports.ts:167

S5.2, D-S5-6: the one command registry. `register` here is legal only while `setup` runs
 (D-S5-4). `run`/`available` work any time, including after this plugin's own setup returns.
 A command this plugin registers lives exactly as long as the plugin. Uninstalling restores
 whatever the id held before. For an overridden core command that is core's own (#155).

***

### disposables

> **disposables**: [`DisposableStore`](DisposableStore.md)

Defined in: view/plugin-ports.ts:162

This plugin's own cleanup list — add a listener or a timer here instead of closing over it by
 hand in the returned `Disposer`. Disposed in reverse order, ahead of that returned `Disposer`.

***

### events

> **events**: [`GanttEvents`](GanttEvents.md)

Defined in: view/plugin-ports.ts:154

`on`/`off` over `GanttEventMap`, including the cancelable `before*` pairs.

***

### interaction

> **interaction**: `object`

Defined in: view/plugin-ports.ts:168

#### registerKeyHandler

> **registerKeyHandler**: [`RegisterKeyHandler`](../type-aliases/RegisterKeyHandler.md)

C3, `plans/reviews/2026-09-02-s5-start-fixes.md`: binds `chord` straight to `handler`,
 through the same keymap `registerKeybinding` uses. It serves a caller with no `Command` to
 run. A plugin that builds its own `Popup` (over `view.overlay` below) is that caller. Its
 Escape dismissal then wins by the keymap's own newest-first order (D-S5-9), the same way
 `extensions/popup.ts`'s own dismissal does.

 Two things differ from `registerKeybinding`. This one is callable any time the plugin is
 installed, not only while `setup` runs. That is because a popup opens and closes for as long
 as the plugin does, not once at startup. This one also returns its own disposer instead of
 auto-removing on plugin disposal. That is because a popup adds and removes its handler on
 every `open()`/`close()`, not once.

#### announceEntryEdit()

> **announceEntryEdit**(`payload`): `void`

S5.8, D-S5-19: announces the committed edit. This raises `entryEdit` after the commit.
 It tells, it does not ask — no veto, and nothing to return.

##### Parameters

###### payload

[`EntryFieldEdit`](EntryFieldEdit.md)

##### Returns

`void`

#### canWrite()

> **canWrite**(`entry`, `field`): `WriteVerdict`

S5.8, D-S5-19: the `edit` capability's one resolution (I14). It is the same answer
 `move`/`resize` already read through `interaction/entry-gestures.ts`'s `ctx.can`. This
 surface exposes it because `inlineEditing()` is the first *plugin* that needs to ask it.
 Every other capability check lives inside core's own gesture wiring, which a plugin cannot
 reach (D-S5-5).

 #256: the question names a cell — one Entry, one Field — because that is what a write names.
 The same answer gates the bar's resize handles and its move. So a plugin that asks it here
 cannot disagree with the gesture that writes the same value. A refusal that carries a
 `reason` is one the user must be told about. A refusal with none is already visible, because
 nothing offered the write at all.

##### Parameters

###### entry

[`Entry`](Entry.md)

###### field

[`FieldKey`](../type-aliases/FieldKey.md)

##### Returns

`WriteVerdict`

#### proposeEntryEdit()

> **proposeEntryEdit**(`payload`): `boolean` \| `Promise`\<`boolean`\>

S5.8, D-S5-19: proposes the edit, and the answer is a Veto. This raises `beforeEntryEdit` on
 this Gantt's own event bus. It returns exactly what the registered handlers returned:
 `true`/`undefined` (no veto), `false`, or an unsettled `Promise` (D-S3-17's async-veto shape,
 U8's `async (…) => { await myDialog.open(...); return false }`). Read the answer — a plugin
 that ignores it opens an editor the consumer refused. This is the one seam a plugin has to
 raise a `before*` pair it implements itself. Core's own gesture pipeline raises every other
 `before*` event, so this is scoped to one event name. A generic `emit` would let a plugin
 forge `selectionChange`, or any other event core itself owns.

##### Parameters

###### payload

[`EntryFieldEdit`](EntryFieldEdit.md)

##### Returns

`boolean` \| `Promise`\<`boolean`\>

#### registerKeybinding()

> **registerKeybinding**(`binding`): [`Disposer`](../type-aliases/Disposer.md)

S5.2, D-S5-7: adds one `KeyBinding`. Legal only while `setup` runs (D-S5-4) — removed
 automatically when this plugin is disposed, the same lifetime every other `register*` gets.
 The returned `Disposer` removes it sooner, for a plugin that binds a chord only in one mode
 (#155). Ignoring the return value is the common case.

##### Parameters

###### binding

[`KeyBindingOf`](KeyBindingOf.md)\<`TGantt`, `TDataset`\>

##### Returns

[`Disposer`](../type-aliases/Disposer.md)

***

### variants

> **variants**: `object`

Defined in: view/plugin-ports.ts:355

ADR 0018: one variant is one object, so one door installs it. `ctx.variants.add(variant)` is
 the plugin half of the `GanttOptions.variants` a consumer writes — one type, two doors, one
 shape. It replaced four registrations that each repeated the variant's name.

#### add()

> **add**(`variant`): [`Disposer`](../type-aliases/Disposer.md)

Installs one variant on this Gantt. `when` says which rows wear it, `items` what shape it
 draws, `paint` how it looks, and `can` what you can do to it. Omit `when` and the variant
 answers for every row nothing newer claims.

 **The newest rule wins** (`Q5`). This plugin's variant wins over core's own `parent`/`leaf`,
 and over any variant installed before it. The consumer's own `GanttOptions.variants` wins
 over every plugin's, whatever order the plugins installed in (D-S5-11). Setup order between
 two plugins comes from `requires` (D-S5-31) — there is no ordering knob here.

 Two plugins whose rules both answer yes for one row raise a `'variant-claimed-twice'` Error
 report naming both, in every build. It is not behind `isDevMode()`: that flag resolves when
 this repo builds `dist/`, so gating it would delete the line from every consumer (D-S5-41).
 The library never arbitrates between plugins: the consumer chose which ones to install, so
 core reports and carries on.

 `when` runs on the hover path, so keep it cheap. It is pure: it answers a question and draws
 nothing. Legal only while `setup` runs (D-S5-4), and disposal removes the variant the same
 way every other `register*` seam's does.

##### Parameters

###### variant

[`EntryVariant`](EntryVariant.md)

##### Returns

[`Disposer`](../type-aliases/Disposer.md)

***

### view

> **view**: `object`

Defined in: view/plugin-ports.ts:211

#### dom

> **dom**: [`GanttDom`](GanttDom.md)

Review N1/A3: this Gantt's own rendered DOM, as three questions — `owns(node)`,
 `targetUnder(node)`, and `barFor(id)`/`cellFor(id, field)`. It is the whole plugin-to-DOM
 contract. `extensions/` may not import `render/` (D-S5-5), so before this seam every plugin
 retyped `.fg-bar`, `.fg-row`, `data-item-id` and five more by hand. Nothing versioned them
 and nothing tested them. Renaming a class broke every plugin with a green build.

 `targetUnder` returns `{ kind, element, entry?, field? }`. `kind` is `TargetKind`, the same
 five words `CommandTarget` uses, so one vocabulary covers a resolved right-click and a
 command's own `when`. Live for the plugin's whole lifetime, not gated by `RegistrationGate`.

#### overlay

> **overlay**: [`MountLayer`](MountLayer.md)

S5.3, D-S5-8: the layer a plugin's own popup, tooltip or menu mounts into — the same
 primitive `extensions/popup.ts`'s `Popup` is built on. It escapes the pane box, so content
 here may spill past a pane edge.

 Live for the plugin's whole lifetime, not gated by `RegistrationGate`. D-S5-4 only gates
 one-shot `register*` calls, and a plugin presents and dismisses content for as long as it
 runs.

#### rowLayer

> **rowLayer**: [`MountLayer`](MountLayer.md)

#158: the grid's own row layer. It is for content that must stay glued to a row or a cell
 while the pane scrolls. An open cell editor is the case.

 The Grid pane has no vertical scrollbar of its own. This layer follows the Timeline pane's
 scroll by one transform per frame (D-S1.8-1). The pane scrolls horizontally around it
 (D-S1.8-13). Content mounted here therefore travels with the rows on both axes, in the same
 frame — no scroll listener, and no lag behind the paint. Position it once against
 `rowLayer.bounds`.

 Use `overlay` instead for content that must escape the pane box. This layer is clipped to
 the pane. A popup dismisses on a scroll rather than following it. Live for the plugin's
 whole lifetime, the same posture as `overlay`.

#### focusedCell()

> **focusedCell**(): \{ `entryId`: [`EntryId`](../type-aliases/EntryId.md); `field`: [`FieldKey`](../type-aliases/FieldKey.md); \} \| `undefined`

S5.11, D-S5-39: which cell real keyboard focus sits on right now — an entry id and a Field
 key. `undefined` when focus is not on a cell (a row, a bar, a header cell, the splitter, or
 nothing focused at all). This is a *fact*, not a node: focus is a view concern. This port is
 how a plugin reads it without touching view state or re-deriving it from the DOM itself.
 (`inline-editing.ts`'s `Enter` handler is the first caller — `ctx.view.focusedCell()`.)

##### Returns

\{ `entryId`: [`EntryId`](../type-aliases/EntryId.md); `field`: [`FieldKey`](../type-aliases/FieldKey.md); \} \| `undefined`

#### onDomEvent()

> **onDomEvent**\<`K`\>(`type`, `handler`, `options?`): [`Disposer`](../type-aliases/Disposer.md)

Review A4: one scoped `document` listener. It filters to this Gantt (I2). It hands the
 handler the resolved `DomTarget` instead of a raw node. It registers its own removal in
 `ctx.disposables`, capture flag included, which a hand-written `removeEventListener` has to
 match by hand. Call: `ctx.view.onDomEvent('dblclick', (event, target) => { … })`. The
 returned `Disposer` removes it sooner, for a listener a plugin attaches per open popup.

 Two Gantts on one page never answer each other's events, which is what a hand-written guard
 kept getting wrong (bug hunt B1). One case is wrong for this seam: a listener that must hear
 events *outside* this Gantt, a dismiss-on-outside-pointer, say. `extensions/popup.ts` keeps
 its own unscoped listener for exactly that.

##### Type Parameters

###### K

`K` *extends* keyof `DocumentEventMap`

##### Parameters

###### type

`K`

###### handler

[`DomEventHandler`](../type-aliases/DomEventHandler.md)\<`K`\>

###### options?

[`DomEventOptions`](DomEventOptions.md)

##### Returns

[`Disposer`](../type-aliases/Disposer.md)

#### registerDecoration()

> **registerDecoration**(`layer`, `provider`): [`Disposer`](../type-aliases/Disposer.md)

S5.6, D-S5-15: registers a pure decoration provider into `layer` (`underBars` below the bar
 layer, `overBars` above). Legal only while `setup` runs (D-S5-4). Disposing this plugin
 removes the provider automatically. A provider has no `close()`/`unregister()` of its own, so
 the plugin's own lifetime is its lifetime. Call: `ctx.view.registerDecoration('underBars', (ctx) =>
 ctx.time.eachDay(ctx.span).filter((day) => ctx.time.dayOfWeek(day) >= 6).map((day) => ({
 kind: 'rangeBand', start: day, end: ctx.time.addDays(day, 1) })))`. The returned `Disposer`
 removes the provider sooner (#155).

##### Parameters

###### layer

[`DecorationLayer`](../type-aliases/DecorationLayer.md)

###### provider

[`DecorationProvider`](../type-aliases/DecorationProvider.md)

##### Returns

[`Disposer`](../type-aliases/Disposer.md)

#### registerGridColumn()

> **registerGridColumn**(`column`): [`Disposer`](../type-aliases/Disposer.md)

S5.9, D-S5-21: registers `column` on this Gantt's grid, appended after the consumer's own
 `gridColumns` in registration order. A duplicate `field` the consumer's own list already
 names is dropped (config beats a plugin). The Field it names still resolves through the
 ordinary Field registry (`UnknownFieldError`/`FieldNotColumnableError` apply unchanged). Legal
 only while `setup` runs (D-S5-4); removed automatically when this plugin is disposed. When two
 plugins register the same field, the newest registration wins, and disposing one plugin never
 disturbs the other plugin's registration. The returned `Disposer` removes the column sooner —
 what a plugin showing its column in one mode only calls (#155).

 The column is this plugin's declaration, and it stays that way (D-S5-33, #181). It never joins
 `gantt.gridColumns`, and it never joins a `gridColumnsChange` payload. A resize or a reorder
 of it commits and repaints, and still changes neither. So a consumer who saves `gridColumns`
 saves their own columns only. Declare the column again on the next install: a Document carries
 no plugin declaration to restore it from.

 **This plugin owns this column's width and its place (D-S5-38, #189).** The library reports
 column geometry; it stores it for nobody, the consumer included. A user resize of this column
 lives in session state and reaches no Document. To carry it across a reload, do what a
 consumer does with `gridColumnsChange`. Listen for that same event. Read your own column back
 from `ctx.view.resolvedColumns()`, by `field` — never from the payload, which reports the
 consumer's columns alone. Save the `width` wherever this plugin's own options say. Then pass
 it here on the next install. A plugin that skips this ships a column that resizes for the
 session only, which is a legitimate choice to make on purpose.

##### Parameters

###### column

[`GridColumnInput`](../type-aliases/GridColumnInput.md)

##### Returns

[`Disposer`](../type-aliases/Disposer.md)

#### registerRenderer()

> **registerRenderer**\<`P`\>(`point`, `renderer`): [`Disposer`](../type-aliases/Disposer.md)

S5.4, D-S5-11: claims one of the four renderer points — `bar`, `cell`, `header`, `tooltip`.
 A consumer's own `GanttOptions.*Renderer` always wins over this. A consumer that wants a
 plugin's renderer to win removes its own instead.

 `cell`, `header` and `tooltip` hold one slot each. A cell belongs to a column and a header
 to a band, so neither has a key to merge on. The `bar` point's per-kind map form (D-S5-12)
 holds one slot **per kind**. So a plugin that defines one kind and a plugin that defines
 another both install (review P2). The whole-point form — a function, not a map — stays
 exclusive. It answers every kind, so it refuses, and is refused by, any per-kind claim.

 Two plugins claiming one slot throws `RendererAlreadyRegisteredError`, naming the slot and
 both plugin ids. Legal only while `setup` runs (D-S5-4). Disposing the plugin frees every
 slot this call claimed. So uninstalling and re-installing one plugin is a legal sequence,
 and not a collision with its own earlier registration (#155). The returned
 `Disposer` frees them sooner.

##### Type Parameters

###### P

`P` *extends* [`RendererPoint`](../type-aliases/RendererPoint.md)

##### Parameters

###### point

`P`

###### renderer

[`RendererFor`](../type-aliases/RendererFor.md)\<`P`\>

##### Returns

[`Disposer`](../type-aliases/Disposer.md)

#### renderElement()

> **renderElement**(`description`): `HTMLElement`

S5.3/S5.4, D-S5-10: builds a live node from an `ElementDescription` — the one seam
 `extensions/` has to the reconciler. `extensions/` may not import `render/` itself (D-S5-5).
 Never `innerHTML`d except the description's own explicit `html` opt-in (I13).

 Call: `ctx.view.renderElement(description)`, then mount the node in either layer above.

##### Parameters

###### description

[`ElementDescription`](ElementDescription.md)

##### Returns

`HTMLElement`

#### resolvedColumns()

> **resolvedColumns**(): readonly [`GridColumn`](../type-aliases/GridColumn.md)[]

Every Grid column this Gantt paints right now, in paint order. The consumer's own columns and
 every plugin's are both here, each with its Field defaults already merged. `gantt.gridColumns` answers a
 different question: what the *consumer* authored (D-S5-33). A plugin that walks the grid wants
 this one. Call: `for (const column of ctx.view.resolvedColumns())`.

##### Returns

readonly [`GridColumn`](../type-aliases/GridColumn.md)[]

#### resolveTooltipColumns()

> **resolveTooltipColumns**(`entry`): readonly [`TooltipColumn`](TooltipColumn.md)[]

D-S5-13: every Grid column marked `tooltip: true`, resolved against this Gantt's current
 `gridColumns`/`fields` — header text and `entry`'s formatted value for each. `tooltips()`'s
 default body appends these after name/dates. A consumer that builds its own tooltip content
 reads the same list, instead of re-resolving columns itself (D-S5-5: `view/grid-columns.ts`
 stays out of reach). Empty when no column is marked `tooltip: true`.

##### Parameters

###### entry

[`Entry`](Entry.md)

##### Returns

readonly [`TooltipColumn`](TooltipColumn.md)[]

#### resolveTooltipContent()

> **resolveTooltipContent**(`entryId`): [`ElementDescription`](ElementDescription.md) \| `undefined`

S5.5 (API gap found while building `tooltips()`): resolves what should paint `entryId`'s
 tooltip body right now. It is the same precedence `registerRenderer('tooltip', …)`'s slot
 resolves at paint time. D-S5-11: the consumer's own `GanttOptions.tooltipRenderer` always
 wins over a plugin's.

 `undefined` means "paint the library's own default content instead". Three cases answer that
 way. First, no renderer is registered at either level. Second, the entry has no bar in the
 current frame, so there is no `FrameBar` to build a `TooltipRendererContext` from. A hover
 plugin works from the DOM after the fact, unlike `bar`/`cell`'s render-pass callers. Third,
 the resolved renderer threw, and this method catches it and logs it in dev mode. That third
 answer is the same fallback `render/dom/index.ts`'s own `callRenderer` gives `bar`/`cell`
 (issue #137 F14).

 `tooltips()` is this method's first caller. A feature that owns a renderer point reads the
 same resolution the render backend would, without reaching `view/renderer-registry.ts`
 directly (D-S5-5).

##### Parameters

###### entryId

`string` \| [`EntryId`](../type-aliases/EntryId.md)

##### Returns

[`ElementDescription`](ElementDescription.md) \| `undefined`

#### variantFor()

> **variantFor**(`entry`): [`ResolvedVariant`](ResolvedVariant.md)

ADR 0018, ADR 0022 §3: the variant this Gantt resolved for one row — the same answer the
 layout pass painted with. A plugin that builds a `CommandContext` of its own fills `variant`
 from `.name` here (`extensions/features/context-menu.ts` is the first caller; `variant` stays
 a `string`). A variant is per Gantt, so a row cannot answer it (I2).

##### Parameters

###### entry

[`Entry`](Entry.md)

##### Returns

[`ResolvedVariant`](ResolvedVariant.md)

## Methods

### raiseError()

> **raiseError**(`report`): `void`

Defined in: view/plugin-ports.ts:159

S5.12, D-S5-40: raises one Error report on this Gantt's `error` event. `by` is filled with this
 plugin's own id, so a subscriber can always tell which plugin spoke. Use `severity: 'info'` for
 a Refusal the plugin made on purpose, `'warning'` for something it recovered from, `'error'` for
 something it did not.

#### Parameters

##### report

[`PluginErrorReport`](../type-aliases/PluginErrorReport.md)

#### Returns

`void`
