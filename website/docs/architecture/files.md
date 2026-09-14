---
id: files
title: "File inventory"
last_update:
  date: 2026-09-14
---

An index of the tree: find the file here, then follow it into [Class map](./classes.md) for what
the class does, and into [Lifecycle](./lifecycle.md) for when it runs.

Every non-test file in `src/`, with the one thing it is for. Barrels (`index.ts`) are listed only
where they do something beyond re-export.

*Derived from `src/**` (excluding `*.test.ts`).*

### `model/` — pure — types + brand helpers, zero deps

| file | exports | what it is for |
| --- | --- | --- |
| `model/ids.ts` | `EntryId, SegmentId, RowId, ItemId, ChangeSetId` and their helpers | Branded string ids. `itemId(entry, seg)` is the deterministic `` `${entryId}:${segmentIndex}` `` rule — the one place that format is written. The `*FromDataset` helpers are the guarded way in from a DOM dataset attribute. |
| `model/time.ts` | `Instant, TimeUnit, TimeSpan, Duration` | `Instant` is branded epoch-ms so a naked number cannot pass as a date. `TimeSpan` is half-open `[start, end)`. Also holds the *input twins* — `InstantInput`, `TimeSpanInput` and `DateOnlyEndRule`: what a consumer may write, as opposed to what the library stores. |
| `model/entry.ts` | `Entry` | The authored record, and it answers questions about itself (ADR 0017): `read(key)`, `duration()`, `hasChildren`, `children()`, `parent()`, `descendants()`, `depth`, `toInput()`. It carries no stored classification — an Entry derives when it has children. `toInput()` gives the loose twin `entries.add()` takes, which is how a row is copied. |
| `model/dataset.ts` | `Dataset` | The *structural* contract (`entries` + `timeZone`) that `api/dataset.ts`'s class implements. Lives here so `layout/` can bind against it without importing `view/` or `api/`. |
| `model/geometry.ts` | `Point, Size, PixelSpan, Rect` | One vocabulary for pixels shared by `layout`, `render`, `view` — instead of four private `{x, y}` shapes. |
| `model/errors.ts` | `FreeGanttError` and the catchable subclasses | The public error base, carrying a stable `code`. Subclasses name failures a consumer can hit: dates, fields, plugins, commands, and mutation. |
| `model/change-set.ts` | `ChangeSet, FieldUpdated` | The *one write shape*: `{ added, removed, updated }`, where an update is `{ entryId, field: FieldKey, from, to }` per field. Emitted on `change`; the shape undo and redo replay. |
| `model/field.ts` | `Field, FieldColumnAlign` | What a value *is* (ADR 0005). A Field key is the whole address (ADR 0011): a core key reads and writes the Entry directly, a `compute` Field runs on read and owns no home, and everything else lives in `entry.props` under its own key. There is no more `source` to declare. |
| `model/command.ts` | `KeyChord, TargetKind` | Zero-dep command primitives. The bound `Command` types live in `api/command.ts`, which may name `Gantt`. |
| `model/error-report.ts` | `ErrorReport, ErrorCode, RaiseError` | What the `error` event carries on Dataset and Gantt (ADR 0009). Types only; the catchable class is `FreeGanttError`. |
| `model/plugin.ts` | `PluginId, Disposer, PluginStore, ExtenderWrapper` | Plugin primitives that name nothing outside `model/`. `ChromePlugin` lives in `api/plugin.ts`. |
| `model/render.ts` | `ElementDescription` | The reconciler's vocabulary as plain data. A plugin returns this instead of a live node; `render/dom/element-description.ts` is the only place that turns it into DOM. |
| `model/index.ts` | barrel | Public types only; brands and error helpers re-exported. |

### `time/` — pure — the only legal home for date arithmetic

| file | exports | what it is for |
| --- | --- | --- |
| `time/instant.ts` | `instant(), now(), toISO(), addMs(), diffMs(), MS` | Epoch-ms primitives and the `MS` constant table. `instant("…")` **rejects a zoneless ISO string** — a wall-clock reading names no instant until a zone resolves it. |
| `time/zone.ts` | `toPlain(), fromPlain(), startOfDay(), addDays(), addMonths(), addYears(), diffDays(), stepBy(), startOf(), SUPPORTED_TIME_UNITS` | All zone-aware arithmetic, on `temporal-polyfill`'s tree-shaken `/fns` API. The private `UNITS` table is the single source of truth for which units can step and floor — `stepBy` and `startOf` both dispatch through it so they cannot disagree. |
| `time/input.ts` | `toInstant(), toEndInstant()` | The one place a loose `InstantInput` becomes a stored `Instant`. It lives in `time/` rather than at the `api/` boundary because resolving a Plain time needs the zone and the DST fold/gap policy only `zone.ts` has — and because advancing a date-only `end` by one day is itself zone-aware arithmetic, confined to this layer. |
| `time/zoned-time.ts` | `ZonedTime, createZonedTime()` | The zone-bound façade a plugin author reaches through `Dataset.time`. Every method forwards to `zone.ts`; no extra arithmetic. |
| `time/scale.ts` | `createTimeScale(), TimeScale, ViewPreset, pxPerMsForPreset()` | Instants ⇄ pixels, plus the shipped zoom presets as frozen config objects. `ticks()` walks calendar boundaries; `MAX_TICKS` guards a misconfigured step from looping forever. |
| `time/format.ts` | `formatDate(), formatEndInclusive(), dropRepeatedGranularity()` | The display-side formatting helpers — inclusive ends, locale-bound labels. Kept small and pure so any consumer-facing text goes through one path. |
| `time/presets.ts` | the shipped view presets, `ZOOM_PRESETS` | Deep-frozen preset ladder from finest hour to coarsest year, plus single-band ids. A preset is a value, never a shared mutable singleton. |
| `time/snap.ts` | `snapInstant(), SnapUnit, stepsBetween()` | Snap resolution for gestures: where a drag's committed value lands. Pure — the gesture pipeline calls this, never arithmetic of its own. A preset's `'tick'` is resolved to a unit and increment before this file sees it. |
| `time/index.ts` | barrel | Public entry points; the façade that keeps the deps confined. |

### `data/` — pure — live state, transactions, fields — no DOM

| file | exports | what it is for |
| --- | --- | --- |
| `data/dataset-state.ts` | `DatasetState, DatasetStateOptions` | The live state one `Dataset` instance owns — a façade holding the entry store, event bus, field registry, history and edit-extender. Exposes `transaction()` as the sole commit entry point. |
| `data/entry-store.ts` | `EntryStore` | Committed entry map plus per-transaction write-set overlay. Exposes `add/update/remove` and a token-gated staging/apply surface so a transaction can stage edits it does not want to leak mid-flight. |
| `data/entry-reader.ts` | `toEntries(), toEntry(), toStoredEdit()` | Maps `EntryInput`/`EntryEdit` through `time/`'s zone conversion into stored `Entry`/`StoredEdit` shapes — the single place field reading and date normalization meet. |
| `data/change-set.ts` | `diffEdit(), foldChangeSet(), invertChangeSet()` | Field-aware changeset building: diffs a `StoredEdit` against committed state, folds a transaction's edits into one `ChangeSet`, and inverts it for undo. |
| `data/transaction.ts` | `runTransaction(), commitChangeSet(), applyConstructionRollUp()` | The transaction runner. Mints a `TxToken`, runs the body, calls the edit-extender once, runs hierarchy promotion, runs rollup, folds the changeset, and emits `beforeChange`/`change`. |
| `data/build-commit-change-set.ts` | `buildCommitChangeSet()` | The four-stage commit pipeline (ADR 0013 dropped the autoGroup promotion stage): body edits → extension hook → rollup → fold. The only module that imports `rollup.ts` on the commit path (`rollup-is-removable`). |
| `data/entry-tree.ts` | `buildEffectiveEntries()` | Shared entry-tree helpers for the rollup pass: overlays proposed edits on committed state so the pass reads an effective tree. |
| `data/history.ts` | `History, HistoryOptions` | The undo/redo stack. Subscribes to `change`, records user changesets, and replays inverted/copied changesets through `replayChangeSet`. |
| `data/rollup.ts` | `rollUpFields()` | Gives every roll-up-kind parent every rolling-up field from its children, bottom-up, on every commit. Yields to the body-proposed field — a user value is never overwritten. |
| `data/computed-cache.ts` | `ComputedFieldCache` | Revision-keyed memo for compute-sourced fields; cleared once per committed changeset. |
| `data/edit-extension.ts` | `EditRequest, EditExtender, identityExtender` | The extension hook shape. `identityExtender` returns an empty map (the unoccupied default); a Dataset plugin or a scheduling plugin occupies this slot by wrapping. |
| `data/plugin-store.ts` | `PluginStores, pluginStoreName()` | Per-plugin per-entry rows, staged through the same write-set a transaction already uses for entries. Not `Entry.meta` (ADR 0002). |
| `data/error-reporting.ts` | `raiseErrorOn(), createErrorRaiser(), buildRefusalReport()` | Stamps an Error report with `now()` and raises it on a bus. Builds the one shape a refused `before*` veto reports. `render/` and `extensions/` take a `RaiseError` by injection instead. |
| `data/dev-mode.ts` | `isDevMode()` | One home for the Vite/dev-mode flag. The named leaf `render/` and `extensions/` may import without opening a `data/` edge. |
| `data/event-bus.ts` | `EventBus, RefusalNote` | Generic typed pub/sub with sync veto. The `beforeChange`/`change` fan-out channel shared by dataset and view. `RefusalNote` holds the first `refuse(reason)` words from one emit. |
| `data/reactivity.ts` | `signal(), computed(), batch()` | The façade over `alien-signals` — the only file touching the reactive dependency. One of exactly two runtime deps, each confined to one façade file. |
| `data/replay.ts` | `replayChangeSet()` | Applies an undo/redo changeset through `commitChangeSet` with no extension hook and no rollup — the replay path is narrower than the live one by design. |
| `data/fields/aggregators.ts` | `SHIPPED_AGGREGATORS` | Built-in aggregator functions — min, max, sum, count, none, weightedMeanByDuration — registered by name so a function reference can serialize into a document. |
| `data/fields/core-fields.ts` | `CORE_FIELDS` | Declares the eight core fields — name, start, end, kind, parentId, segments, meta, duration — as `Field` declarations of the same shape a consumer writes. |
| `data/fields/field-access.ts` | `createFieldAccess(), mergeProposedEdits(), ambientFieldContext(), createComputeContext()` | The one reader behind every by-key value: a core key, a `props` key, or a `compute` Field. It also merges and overlays proposed edits, so a rule reads the row an edit would produce. |
| `data/fields/field-registry.ts` | `FieldRegistry` | One registry per dataset. Resolves field types, merges core + consumer declarations, validates uniqueness, and provides lookup by key. |
| `data/index.ts` | barrel | Re-exports `DatasetState`, `DatasetStateOptions`, `HistoryOptions`, `EntryStore`; everything else internal. |

### `layout/` — pure — headless geometry — rows, items, frame

| file | exports | what it is for |
| --- | --- | --- |
| `layout/frame.ts` | `computeFrame(), GeometryFrame, LayoutInput, FrameRow/Item/Header*, Overscan, DEFAULT_OVERSCAN` | The full pure layout pass: resolves rows, produces items per row, culls to the visible window, and computes header ticks and date-line decorations. One call in → one `GeometryFrame` out. |
| `layout/frame-layout.ts` | `FrameLayout` | The stateful wrapper that keeps a `RowHeightIndex` and per-row item memo alive across renders. One instance per Gantt. |
| `layout/frame-memory.ts` | `FrameMemory` | Holds one layout pass's cross-render memory — the `RowHeightIndex` plus a `Map` of per-row item memos — so a later frame reuses geometry where the inputs did not change. |
| `layout/row-height-index.ts` | `RowHeightIndex, PrefixSumHeightIndex` | O(log n) prefix sums with binary search for `indexAtY`. Behind an interface so variable row heights can swap the implementation without touching `computeFrame`. |
| `layout/column.ts` | `FrameColumn, ResolvedColumn, FieldCompare` | Pure data types for the grid-column paint shape and its locale-bound formatter. |
| `layout/date-line.ts` | `resolveDateLines()` | Resolves the today-line and authored date lines into positioned `DateLine` decorations. |
| `layout/gesture-draft.ts` | `draftForMove(), draftForResize(), previewOffsets(), cursorLabelForX()` | Pure gesture math for drag previews. All date computation stays here so `interaction/` performs no arithmetic. |
| `layout/decoration.ts` | `DecorationLayer, DecorationProvider, RangeBand, RowStripe` | The decoration seam's own types — range bands and row stripes as pixel-resolved shapes. |
| `layout/decorations.ts` | `DecorationRunner` | Runs registered decoration providers into the frame's under-bar and over-bar layers. |
| `layout/frame-row.ts` | `FrameRow` | The painted-row shape `computeFrame` emits and a cell renderer reads. |
| `layout/pick-defined.ts` | `pickDefined()` | Copies only defined keys from a patch onto a settings object. |
| `layout/registration-table.ts` | `createRegistrationTable()` | Stack-per-key registration with a disposer that removes exactly its own entry. Named leaf that `extensions/` may import. |
| `layout/renderer.ts` | `BarRenderer, CellRenderer, HeaderRenderer, TooltipRenderer` | Renderer callback vocabulary. Plugin and consumer options share these types. |
| `layout/items/produce-items.ts` | `produceItemsForRow(), resolveItems()` | Turns a row's entries into Items. Nothing dispatches on a type tag: the variant registry answers what one Entry draws, and that variant's producer builds the Items (ADR 0018). A header row produces none. |
| `layout/rows/resolve-rows.ts` | `resolveRows()` | Dispatches to the correct row source based on `source.source`, stamping each row with a sequential index. |
| `layout/rows/row-source.ts` | `RowSource, EntriesRowSource, GroupRowSource, CustomRowSource, PlannedRow, etc.` | Pure data types defining the three row-source configs and their shared options (`filter`, `sort`, `filterPolicy`). |
| `layout/rows/entries-source.ts` | `resolveEntriesSource()` | Flat mode maps each entry one-to-one; tree mode does a depth-first walk using `parentId`. |
| `layout/rows/group-source.ts` | `resolveGroupSource()` | Buckets entries by the consumer-supplied `groupBy` function, emitting header rows then member rows. |
| `layout/rows/custom-source.ts` | `resolveCustomSource()` | Adapts a consumer-supplied `resolve()` callback's `CustomRow[]` into `UnindexedRow[]`. |
| `layout/rows/collapse.ts` | `applyCollapse()` | Drops descendants of collapsed row ids from the unindexed row list. |
| `layout/rows/filter.ts` | `applyFilter(), visibleRowIds()` | Applies the row-source filter, with hide vs. keep-ancestors policy. |
| `layout/rows/sort.ts` | `applySort()` | Applies the row-source sort inside each sibling group. |
| `layout/viewport/batched-notifier.ts` | `BatchedNotifier` | Depth counter + pending flag + `finally` flush. Several writes, at most one notification, no observer ever sees an intermediate state. |
| `layout/viewport/bound-value.ts` | `BoundValue, BoundValueContract, BoundValueHandle` | The binding side of a shareable model: one `Map<Binding, onChange>` serving both membership and notification, a memoized resolved value, and the notify-iff-changed rule. |
| `layout/viewport/time-scale-model.ts` | `TimeScaleModel, TimeScaleIntent, ScaleBinding, ScaleBindingHandle` | Shareable x-axis. Takes *intent* (preset, range) and resolves zone/span/zoom from the Gantts bound to it. Two Gantts sharing one instance are x-synced by construction. |
| `layout/viewport/scroll-model.ts` | `ScrollModel, ScrollIntent, ScrollBinding, ScrollState, ScrollBindingHandle` | Shareable scroll position. Owns one shared position; each bound Gantt clamps it locally. |
| `layout/viewport/viewport.ts` | `Viewport, ViewportOptions, ViewportHandle` | The fan-in: one bind, one handle, one reaction over both models plus this Gantt's own pane size, content size and overscan. |
| `layout/index.ts` | barrel | Public layout entry points; the re-export that reaches `model/` types. |

### `render/` — DOM — `GeometryFrame` → pixels

| file | exports | what it is for |
| --- | --- | --- |
| `render/backend.ts` | `RenderBackend<TSurface>, InteractionState, HitResult` | The backend seam. Names no DOM type itself — `TSurface` carries that. |
| `render/dom/index.ts` | `createDomBackend()` | The default backend: four absolutely-positioned layers plus a 1×1 content sizer, driven by `syncKeyed`. |
| `render/dom/sync-keyed.ts` | `syncKeyed(), SyncKeyedSpec, KeyedLayer, NestedKeyedLayers` | The whole reconciler. Look-up-or-create per key → patch only if geometry changed → prune vanished keys. Scope is hard-bounded to attr/class/style/text + keyed children. |
| `render/dom/pixel-property.ts` | `readPixelProperty(), PixelPropertyPolicy` | One reader for every `--fg-*` pixel custom property, with an explicit validity policy so "zero is nonsense" and "zero is a choice" are stated, not implied. |
| `render/dom/date-line.ts` | `syncDateLine() / renderDateLine()` | Renders the today-line and authored date lines as positioned decoration elements. |
| `render/dom/decorations.ts` | `DecorationsAttachment` | Turns `RangeBand`/`RowStripe` into keyed DOM nodes. |
| `render/dom/dom-contract.ts` | `BAR_CLASS, ROW_CLASS, …` | Class names and data attributes this backend writes. Nothing outside `render/dom` may retype them; `view/gantt-dom.ts` resolves a node from these constants alone. |
| `render/dom/element-description.ts` | `buildElement()` | Turns one `ElementDescription` into a live DOM subtree. Stays inside the reconciler's hard-bounded scope. |
| `render/dom/css-escape.ts` | `cssEscapeAttr()` | One place for the `CSS.escape` feature-detect every `[data-field="…"]` selector needs. |
| `render/dom/row-twisty.ts` | `rowIdFromTwistyClick()` | Row twisty hit target. Keeps `.fg-row-twisty`, `.fg-row` and `data-row-id` out of `view/` so a second backend owns its own control geometry. |
| `render/null/index.ts` | `createNullBackend(), NullBackend` | Headless backend recording the last frame. For tests, SSR-of-data, and the future export seam. |

### `view/` — DOM — the shell, gestures, capabilities, navigation

| file | exports | what it is for |
| --- | --- | --- |
| `view/gantt-shell.ts` | `GanttShell, GanttShellOptions` | The composition root. Constructs the `Viewport`, `FrameLayout`, `PaneLayout`, `RenderBackend`, `EventBus`, `FrameScheduler`, `GesturePipeline`, `PluginRuntime`, `TreeCollapse` and every attachment; exposes live-reconfigurable properties. |
| `view/frame-settings.ts` | `FrameSettings, DEFAULT_ROW_HEIGHT` | Every live setting that says what the next frame draws, plus the table of what each change invalidates. |
| `view/plugin-ports.ts` | `buildPluginPorts(), PluginContextParts` | Everything a `PluginContext` carries that `GanttShell` owns. Spread into the public context; `api/gantt.ts` adds only `dataset` and `gantt`. |
| `view/plugin-registrations.ts` | `PluginRegistrations` | The five seams a plugin registers into — renderer, decoration, item producer, kind default, grid column — each with the refresh it owes. |
| `view/renderer-registry.ts` | `RendererRegistry` | Resolves which renderer paints one bar/cell/header/tooltip. Consumer config always wins over a plugin. |
| `view/gantt-dom.ts` | `GanttDom, ContainerDom, DomTarget` | This Gantt's rendered DOM as a read surface: is this node mine, what is it, where is the element for this entry. |
| `view/mount-layer.ts` | `MountLayer` | Where a plugin mounts and how it stays put. Overlay escapes the pane box; row layer travels with the rows. |
| `view/column-chrome.ts` | `ColumnChrome` | Grid-column resolve, live resize/reorder preview, and the one commit sequence pointer drag and `gantt.gridColumns = …` share. |
| `view/column-gesture-context.ts` | `ColumnGestureContext` | The seam `interaction/column-gestures.ts` drives and `GanttShell` implements. |
| `view/core-commands.ts` | `registerCoreCommands()` | The core command catalog, split out of the shell so it is reviewable as a table. |
| `view/tree-collapse.ts` | `TreeCollapse` | Collapsed `RowId`s as per-Gantt view state, plus the tree-arrow and ancestor-expand policy. Propose/commit two-step, so a `beforeCollapseChange` veto can cancel the commit. |
| `view/today-landing.ts` | `panToTodayLine()` | Today-landing policy. The shell asks this; Viewport only pans. |
| `view/pane-layout.ts` | `PaneLayout` | Builds the three-pane DOM skeleton — grid, splitter, timeline. |
| `view/scroll-attachment.ts` | `attachScroll(), ScrollAttachment` | The only file allowed to touch `scrollTop`/`scrollLeft` (invariant I12). ε-filtered so a model-driven write cannot bounce back as a user scroll. |
| `view/pane-size-attachment.ts` | `attachPaneSize(), PaneSizeAttachment` | The only file that observes element size. Reports a box and stops. |
| `view/splitter.ts` | `attachSplitter()` | Pointer-drag handler on the splitter chrome that resizes the grid pane. |
| `view/styles.ts` | `ensureBaseStyles()` | Idempotently injects the library's base stylesheet once per `document`. |
| `view/frame-scheduler.ts` | `FrameScheduler` | Coalesces render requests into at most one `requestAnimationFrame` per tick — the throttle between "a change happened" and "a frame drew". |
| `view/dataset-change-subscription.ts` | `subscribeToDatasetChanges()` | Bridges the dataset's `change` event into the shell's render pipeline. |
| `view/grid-columns.ts` | `resolveColumns(), resolveFieldCompares(), bindGanttFields()` | Bridges the consumer's `gridColumns` input and field declarations to layout's `ResolvedColumn[]` model. |
| `view/capability.ts` | `resolveCapabilities()` | Merges the consumer's `Interactions` overrides with the per-kind default table; returns `Capabilities` with a `can(capability, entry)` method (invariant I14). |
| `view/affordance-projection.ts` | `projectAffordances()` | Pure projection of hovered/movable/resizable paint tokens from hover, selection, and capability resolution. |
| `view/entry-gesture-context.ts` | `EntryGestureContext, EntryGestureSession, EntryHit` | The type-seam between `view/` (which implements it) and `interaction/` (which drives it). |
| `view/gesture-pipeline.ts` | `GesturePipeline` | Owns the full gesture lifecycle for move/resize — entry resolution, draft math, preview rAF coalescing, snap resolution, and a commit pipeline with sync/async veto. |
| `view/viewport-gestures.ts` | `resolveViewportGestures()` | Resolves per-gesture on/off flags for wheel zoom/pan and keyboard pan. |
| `view/collapse-state.ts` | `CollapseChange` | The payload both collapse events carry. The state itself lives in `view/tree-collapse.ts`. |
| `view/attach-row-twisty.ts` | `attachRowTwisty()` | Grid-pane click on a row twisty toggles collapse. Lives here, not in `interaction/`: collapse is viewport state, not a data gesture. |
| `view/keyboard-navigation.ts` | `attachKeyboardNavigation()` | Keydown handler for viewport navigation when nothing is selected. |
| `view/wheel-navigation.ts` | `attachWheelNavigation()` | ctrl/cmd+wheel zoom and shift+wheel pan. |
| `view/event-bus.ts` | `GanttEventMap` | Declares the ten-plus event names and payload types, re-exporting the generic `EventBus` mechanism from `data/event-bus.ts`. |
| `view/index.ts` | public barrel | Re-exports the shell and the view-surface types `api/` needs. |

### `interaction/` — DOM — drives the gesture seam, no layout math

| file | exports | what it is for |
| --- | --- | --- |
| `interaction/entry-gestures.ts` | `attachEntryGestures()` | Wires pointer events on entries into the `EntryGestureContext`'s session lifecycle. |
| `interaction/column-gestures.ts` | `attachColumnGestures()` | Resize and reorder pointer sequences for grid columns, over the same `createPointerGesture` controller. |
| `interaction/keyboard-editing.ts` | `attachKeyboardEditing()` | Handles Delete/arrow-key edits on selected entries. |
| `interaction/pointer-gesture.ts` | `createPointerGesture()` | Low-level pointer capture/release and move/up dispatch. Owns no DOM listeners of its own. |
| `interaction/index.ts` | barrel | Re-exports the attach functions and `createPointerGesture`. |

### `api/` — public — the only import a consumer makes

| file | exports | what it is for |
| --- | --- | --- |
| `api/dataset.ts` | `Dataset, DatasetOptions` | The public data store. Entries CRUD, transactions, events, fields, undo/redo — all delegated into `data/`. |
| `api/gantt.ts` | `Gantt, GanttOptions` | The public `Gantt` class. Constructs one `GanttShell` and forwards; exposes the live properties (preset, range, gridColumns, rowSource, collapsed, selection, plugins, commands, …). |
| `api/plugin.ts` | `ChromePluginOf, DataPluginOf, PluginOf` | The public Gantt-plugin contract, generic over `TGantt` so this file never imports `Gantt` (no cycle). |
| `api/dataset-plugin.ts` | `DatasetPluginContextOf, mergeEntryEdits(), moveEntryTo()` | The public Dataset-plugin contract, plus the one legal merge of two extenders' writes. |
| `api/command.ts` | `CommandOf, CommandContextOf, BuiltInCommandId` | The public command and keybinding contract, generic over `TGantt`. |
| `api/attempt-mutation.ts` | `attemptMutation()` | Runs a mutating body and returns `false` when `beforeChange` refuses, instead of throwing. |
| `api/watch-all-errors.ts` | `watchAllErrors()` | One handler over the Dataset `error` feed and the Gantt's, de-duplicated. |
| `api/time-facade.ts` | `formatDate, formatEndInclusive` | Narrow slice of `time/` that `extensions/features/tooltips.ts` needs without importing the public barrel (that barrel re-exports `tooltips`). |
| `api/index.ts` | the public surface | The allow-list with a sealed `exports` map. Re-exports `Gantt`/`Dataset`/the viewport models, the plugin and command contracts, the shipped built-ins, and the `model/` and `time/` types a consumer needs. |

### `extensions/` — DOM — plugin runtime + shipped built-ins

| file | exports | what it is for |
| --- | --- | --- |
| `extensions/plugin-runtime.ts` | `PluginRuntime, RegistrationGate` | Installs, uninstalls, and sets up Gantt plugins. The shell constructs one; a built-in never imports the shell. |
| `extensions/install-dataset-plugins.ts` | `installDatasetPlugins(), resolveSetupOrder()` | Orders Dataset plugins by `requires` and installs them onto a Dataset. |
| `extensions/disposables.ts` | `DisposableStore` | A plugin's cleanup list. Runs on uninstall or `Gantt.destroy()`. |
| `extensions/commands.ts` | `CommandRegistry` | Command registry, generic over its Gantt type. Core commands and plugin commands share it. |
| `extensions/keymap.ts` | `Keymap, normalizeChord()` | Newest-first key handler resolver. Innermost popup wins. |
| `extensions/popup.ts` | `createPopup()` | Anchoring, flipping, clamping, and dismissal. Tooltips and the context menu each hold their own instance, so both may show. |
| `extensions/focus-trap.ts` | `activateFocusTrap()` | Tab cycling and focus restore for `Popup`'s trap policy. |
| `extensions/features/tooltips.ts` | `tooltips()` | Shipped tooltip plugin. Ordinary `ChromePlugin`; dogfoods the public contract. |
| `extensions/features/context-menu.ts` | `contextMenu()` | Shipped context-menu plugin. Asks `ctx.view.dom` what a node is. |
| `extensions/features/menu-view.ts` | `MenuItem, MenuEntry` | Menu vocabulary and `ElementDescription` builder. Pure; no DOM mount. |
| `extensions/features/inline-editing.ts` | `inlineEditing()` | Shipped cell editor. Owns a live control rather than a static `Popup` content tree. |
| `extensions/features/date-input.ts` | `DateInput, DateInputFactory` | Default date seam: wraps `<input type="date">`. No extra runtime dep. |
| `extensions/index.ts` | barrel | Re-exports the runtime, commands, keymap, and the shipped built-ins. |

### not yet written

| file | exports | what it is for |
| --- | --- | --- |
| `scheduling/index.ts` | — | S7. The first-party default plugin's pure engine + the `EditExtender` occupancy. |
