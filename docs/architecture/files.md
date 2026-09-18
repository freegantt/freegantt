# File inventory

An index of the tree: find the file here, then follow it into [Class map](./classes.md) for what
the class does, and into [Lifecycle](./lifecycle.md) for when it runs.

Every non-test file in `src/`, with the one thing it is for. Barrels (`index.ts`) are listed only
where they do something beyond re-export.

*Derived from `src/**` (excluding `*.test.ts`).*

### `model/` — pure — types + brand helpers, zero deps

| file | exports | what it is for |
| --- | --- | --- |
| `model/ids.ts` | `EntryId, RowId, BarId, ChangeSetId` and their helpers | Branded string ids. `barId(entry, partIndex)` is the deterministic `` `${entryId}:${partIndex}` `` rule — the one place that format is written. The `*FromDataset` helpers are the guarded way in from a DOM dataset attribute. |
| `model/time.ts` | `Instant, TimeUnit, TimeSpan, Duration` | `Instant` is branded epoch-ms so a naked number cannot pass as a date. `TimeSpan` is half-open `[start, end)`. Also holds the *input twins* — `InstantInput`, `TimeSpanInput` and `DateOnlyEndRule`: what a consumer may write, as opposed to what the library stores. |
| `model/entry.ts` | `Entry` | The authored record, and it answers questions about itself (ADR 0017): `read(key)`, `duration()`, `hasChildren`, `children()`, `parent()`, `descendants()`, `depth`, `toInput()`. It carries no stored classification — an Entry derives when it has children. `toInput()` gives the loose twin `entries.add()` takes, which is how a row is copied. |
| `model/dataset.ts` | `Dataset` | The *structural* contract (`entries` + `timeZone`) that `api/dataset.ts`'s class implements. Lives here so `layout/` can bind against it without importing `view/` or `api/`. |
| `model/geometry.ts` | `Point, Size, PixelSpan, Rect` | One vocabulary for pixels shared by `layout`, `render`, `view` — instead of four private `{x, y}` shapes. |
| `model/errors.ts` | `FreeGanttError` and the catchable subclasses | The public error base, carrying a stable `code`. Subclasses name failures a consumer can hit: dates, fields, plugins, commands, and mutation. |
| `model/change-set.ts` | `ChangeSet, FieldUpdated` | The *one write shape*: `{ added, removed, updated }`, where an update is `{ entryId, field: FieldKey, from, to }` per field. Emitted on `change`; the shape undo and redo replay. |
| `model/field.ts` | `Field, ColumnAlign` | What a value *is* (ADR 0005). A Field key is the whole address (ADR 0011): a core key reads and writes the Entry directly, a `compute` Field runs on read and owns no home, and everything else lives in `entry.props` under its own key. There is no more `source` to declare. |
| `model/command.ts` | `KeyChord, TargetKind` | Zero-dep command primitives. The bound `Command` types live in `api/command.ts`, which may name `Gantt`. |
| `model/error-report.ts` | `ErrorReport, ReportCode, RaiseError` | What the `error` event carries on Dataset and Gantt (ADR 0009). Types only; the catchable class is `FreeGanttError`. |
| `model/plugin.ts` | `PluginId, Disposer, PluginStore, ExtenderWrapper` | Plugin primitives that name nothing outside `model/`. `ChromePlugin` lives in `api/plugin.ts`. |
| `model/render.ts` | `ElementDescription` | The reconciler's vocabulary as plain data. A plugin returns this instead of a live node; `render/dom/element-description.ts` is the only place that turns it into DOM. |
| `model/stored-entry.ts` | `StoredEntry, EntryInput, EntryEdit, EditRequest, EditExtender, spansTime()` | What storage owns, and the loose shapes that reach it. `spansTime()` is the one place the span invariant is written: an Entry spans when it holds both `start` and `end` (ADR 0012). |
| `model/field-key.ts` | `CoreFieldKey, FieldKey, CoreFieldValues, CoreFieldValue, FieldValue` | A Field key names a Field and is the changeset's `field` (ADR 0011). Derives from `StoredEntry`, so it sits one file below `field.ts` — the live `Entry` names Field keys too, and the shared leaf keeps the two out of an import ring. |
| `model/hierarchy-source.ts` | `HierarchySource, HierarchySourceWrapper` | Which Entry is the parent of this one (ADR 0020). A plugin states the answer; core owns everything downstream of it — child index, `depth`, the descendant walk, and the Rollup. |
| `model/write-verdict.ts` | `WriteRefusalReason, WriteVerdict` | The verdict pair a plugin author reads off `ctx.interaction.canWrite`. Declared here, not in `data/`, because only `api/` and `model/` types are public — `data/write-rule.ts` computes it and `view/` republishes it. |
| `model/capabilities.ts` | `Capabilities, CapabilityRule, WriteRule, GestureCapability` | What a consumer, or a Variant, may say about a gesture. Declared here so `layout/variants.ts` can name `capabilities?: Capabilities` without reaching above `model/` (ADR 0018); `view/capability.ts` is still the one file that resolves them, and it owns the separate `ResolvedCapabilities` those rules produce. |
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
| `data/entry-reader.ts` | `toEntries(), toEntry(), toEditReading()` | Maps `EntryInput`/`EntryEdit` through `time/`'s zone conversion into stored `Entry`/`StoredEdit` shapes — the single place field reading and date normalization meet. |
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
| `data/fields/core-fields.ts` | `CORE_FIELDS` | Declares the six core fields — name, start, end, parentId, duration, hierarchyParentId — as `Field` declarations of the same shape a consumer writes. |
| `data/fields/field-access.ts` | `createFieldAccess(), mergeProposedEdits(), ambientFieldContext(), createComputeContext()` | The one reader behind every by-key value: a core key, a `props` key, or a `compute` Field. It also merges and overlays proposed edits, so a rule reads the row an edit would produce. |
| `data/fields/field-registry.ts` | `FieldRegistry` | One registry per dataset. Resolves field types, merges core + consumer declarations, validates uniqueness, and provides lookup by key. |
| `data/live-entry.ts` | `LiveEntries, EntrySource` | Builds the live `Entry` (ADR 0017): `model/` declares the interface, `data/` builds it, `layout/` names the type but never the file. Every read goes back to the store, so a row read inside an open transaction sees the write set overlaid on committed state. |
| `data/hierarchy-source.ts` | `storedParentSource, parentIdFrom(), ParentIndex, CheckedHierarchy, checkHierarchyAnswers()` | Core's own hierarchy source, plus the check core runs over any source's answers (ADR 0020). An unknown parent id reads as a root, and a cycle's closing link breaks. Both are refused answers, and neither throws — the check reports nothing itself; the caller raises. |
| `data/write-rule.ts` | `resolveWriteTarget(), libraryWriteRule, isUserEditable(), isApiEditable(), WriteTarget` | The one write resolver where three questions meet (ADR 0011): does the Field exist, is it editable, is it derived here. `view/capability.ts` asks the grid threshold before it opens a cell; `entry-store.ts`'s `update()` asks the API threshold before it stages a write (I14). |
| `data/fields/column-sizing.ts` | `sizingOfColumn(), ColumnSizingCandidate` | The `width`/`flex` pair merges as one pair, never key by key (#249). The Field-column merge and the Gantt-column merge each fixed that bug independently once; this is the one function both now call. |
| `data/fields/field-types.ts` | `text, number, percent, date, duration, currency(), SHIPPED_FIELD_TYPES` | The shipped Field types (D-S4-3): `text`, `number`, `percent`, `date`, `duration`, plus `currency()`. `currency({ code })` is a factory, not a seeded name. `percent` formats through `Intl.NumberFormat`'s own `'percent'` style, so a stored `35` divides by 100 first and locale spacing is right — a hand-rolled `${value}%` gets French and Arabic wrong. |
| `data/index.ts` | barrel | Re-exports `DatasetState`, `DatasetStateOptions`, `HistoryOptions`, `EntryStore`; everything else internal. |

### `layout/` — pure — headless geometry — rows, bars, frame

| file | exports | what it is for |
| --- | --- | --- |
| `layout/frame.ts` | `computeFrame(), GeometryFrame, LayoutInput, FrameRow/Bar/Header*, Overscan, DEFAULT_OVERSCAN` | The full pure layout pass: resolves rows, produces bars per row, culls to the visible window, and computes header ticks and date-line decorations. One call in → one `GeometryFrame` out. |
| `layout/frame-layout.ts` | `FrameLayout` | The stateful wrapper that keeps a `RowHeightIndex` and per-row bar memo alive across renders. One instance per Gantt. |
| `layout/frame-memory.ts` | `FrameMemory` | Holds one layout pass's cross-render memory — the `RowHeightIndex` plus a `Map` of per-row bar memos — so a later frame reuses geometry where the inputs did not change. |
| `layout/row-height-index.ts` | `RowHeightIndex, PrefixSumHeightIndex` | O(log n) prefix sums with binary search for `indexAtY`. Behind an interface so variable row heights can swap the implementation without touching `computeFrame`. |
| `layout/column.ts` | `FrameColumn, ResolvedColumn, FieldCompare` | Pure data types for the grid-column paint shape and its locale-bound formatter. |
| `layout/column-renderers.ts` | `meter(), image()` | Shipped Grid-column renderers as DOM-free description trees (#265). `meter()` paints a percent as a track; `image()` paints a stored URL as an img. The look lives in the always-on sheet — a Column renderer cannot carry a css string the way a variant can. |
| `layout/date-line.ts` | `resolveDateLines()` | Resolves the today-line and authored date lines into positioned `DateLine` decorations. |
| `layout/gesture-draft.ts` | `draftForMove(), draftForResize(), previewOffsets(), cursorLabelForX()` | Pure gesture math for drag previews. All date computation stays here so `interaction/` performs no arithmetic. |
| `layout/decoration.ts` | `DecorationLayer, DecorationProvider, RangeBand, RowStripe` | The decoration seam's own types — range bands and row stripes as pixel-resolved shapes. |
| `layout/decorations.ts` | `DecorationRunner` | Runs registered decoration providers into the frame's under-bar and over-bar layers. |
| `layout/frame-row.ts` | `FrameRow` | The painted-row shape `computeFrame` emits and a cell renderer reads. |
| `layout/pick-defined.ts` | `pickDefined()` | Copies only defined keys from a patch onto a settings object. |
| `layout/entry-rule.ts` | `compileEntryRule(), EntryRule, EntryPredicate, FieldMatch, EntryRulePorts` | One match syntax for "which Entry does this rule claim?" — a variant's `when` and a row source's `childrenAsSegments` both compile through this, so `bars/` and `rows/` never import each other over it (#421 C1). |
| `layout/registration-table.ts` | `createRegistrationTable()` | Stack-per-key registration with a disposer that removes exactly its own entry. Named leaf that `extensions/` may import. |
| `layout/renderer.ts` | `BarRenderer, GridCellRenderer, HeaderRenderer, TooltipRenderer` | Renderer callback vocabulary. Plugin and consumer options share these types. |
| `layout/bars/produce-bars.ts` | `produceBarsForRow(), resolveBars()` | Turns a row's entries into Bars. Nothing dispatches on a type tag: the variant registry answers what one Entry draws, and that variant's producer builds the Bars (ADR 0018). A header row produces none. |
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
| `layout/viewport/scroll-axis.ts` | `ScrollAxis, ScrollAxisState, ScrollAxes, ScrollAxisBinding, ScrollAxisBindingHandle, bindScrollAxis()` | Shareable one-direction scroll position (D-S6-1). Owns one shared position for one axis; each bound Gantt clamps it locally. A Gantt holds two, `{ x, y }`. |
| `layout/viewport/viewport.ts` | `Viewport, ViewportOptions, ViewportHandle` | The fan-in: one bind, one handle, one reaction over both models plus this Gantt's own pane size, content size and overscan. |
| `layout/bars/bar.ts` | `Bar, BarProducer, BarAnchor, FixedBarBox, DrawnVariant, VariantBars, entryBar(), wholeEntryBar(), fixedWidthBar()` | What one row draws, as plain data — one Bar is one bar. Holds the Bar vocabulary alone, so `variants.ts` may name `BarProducer` and `produce-bars.ts` may name both, with no import ring between the three. |
| `layout/bars/variants.ts` | `VariantRegistry, createVariantRegistry(), EntryRule, ResolvedVariant, EntryVariant, bar, summary, diamond` | The Variant rule, and the file where a row meets one (ADR 0018). One object answers five questions about a row's shape: which rows wear it (`when`), what shape it draws (`bars`), how it looks (`paint`), what you can do to it (`can`), and the rules its look needs (`css`, ADR 0022 §5). |
| `layout/entry-double.ts` | `entryDouble(), entryDoubles(), entryDoublesById(), entryValuesOf(), EntryDoubleValues` | **Test-only.** The live `Entry` a `layout/` test builds by hand (ADR 0017). It also proves the seam by construction: `layout/` satisfies the whole interface out of `model/` and `time/` alone, so the `layout-boundary` rule stays untouched. |
| `layout/index.ts` | barrel | Public layout entry points; the re-export that reaches `model/` types. |

### `render/` — DOM — `GeometryFrame` → pixels

| file | exports | what it is for |
| --- | --- | --- |
| `render/backend.ts` | `RenderBackend<THost>, RenderSurfaces, InteractionState, HitResult` | The backend seam. Names no DOM type itself — `THost` carries that. |
| `render/dom/index.ts` | `createDomBackend()` | The default backend: four absolutely-positioned layers plus a 1×1 content sizer, driven by `syncKeyed`. |
| `render/dom/sync-keyed.ts` | `syncKeyed(), SyncKeyedSpec, KeyedLayer, NestedKeyedLayers` | The whole reconciler. Look-up-or-create per key → patch only if geometry changed → prune vanished keys. Scope is hard-bounded to attr/class/style/text + keyed children. |
| `render/dom/pixel-property.ts` | `readPixelProperty(), PixelPropertyPolicy` | One reader for every `--fg-*` pixel custom property, with an explicit validity policy so "zero is nonsense" and "zero is a choice" are stated, not implied. |
| `render/dom/date-line.ts` | `attachDateLines(), DateLineAttachment` | Renders the today-line and authored date lines as positioned decoration elements. |
| `render/dom/decorations.ts` | `DecorationsAttachment` | Turns `RangeBand`/`RowStripe` into keyed DOM nodes. |
| `render/dom/dom-contract.ts` | `BAR_CLASS, ROW_CLASS, …` | Class names and data attributes this backend writes. Nothing outside `render/dom` may retype them; `view/gantt-dom.ts` resolves a node from these constants alone. |
| `render/dom/element-description.ts` | `buildElement()` | Turns one `ElementDescription` into a live DOM subtree. Stays inside the reconciler's hard-bounded scope. |
| `render/dom/css-escape.ts` | `cssEscapeAttr()` | One place for the `CSS.escape` feature-detect every `[data-field="…"]` selector needs. |
| `render/dom/row-twisty.ts` | `rowIdFromTwistyClick()` | Row twisty hit target. Keeps `.fg-row-twisty`, `.fg-row` and `data-row-id` out of `view/` so a second backend owns its own control geometry. |
| `render/dom/tick-lines.ts` | `attachTickLines(), TickLineAttachment` | The timeline grid lines, as one keyed layer. The geometry is `GeometryFrame.tickLines` from `layout/frame.ts`; this file only paints it. A consumer opts out through `--fg-tick-line-color` (J2). |
| `render/dom/text-ruler.ts` | `createTextRuler(), TextRuler` | Measures a bar label's width in CSS px off a canvas 2D context that shares the bar layer's font (J1). `measureText` reads glyph metrics with no layout pass, which is what keeps a placement check affordable for every bar on every frame. |
| `render/null/index.ts` | `createNullBackend(), NullBackend` | Headless backend recording the last frame. For tests, SSR-of-data, and the future export seam. |

### `view/` — DOM — the shell, gestures, capabilities, navigation

| file | exports | what it is for |
| --- | --- | --- |
| `view/gantt-shell.ts` | `GanttShell, GanttShellOptions` | The composition root. Constructs the `Viewport`, `FrameLayout`, `PaneLayout`, `RenderBackend`, `EventBus`, `FrameScheduler`, `GesturePipeline`, `PluginRuntime`, `TreeCollapse` and every attachment; exposes live-reconfigurable properties. |
| `view/frame-settings.ts` | `FrameSettings, DEFAULT_ROW_HEIGHT` | Every live setting that says what the next frame draws, plus the table of what each change invalidates. |
| `view/plugin-ports.ts` | `buildPluginPorts(), PluginContextParts` | Everything a `PluginContext` carries that `GanttShell` owns. Spread into the public context; `api/gantt.ts` adds only `dataset` and `gantt`. |
| `view/plugin-registrations.ts` | `PluginRegistrations` | The five seams a plugin registers into — renderer, decoration, bar producer, kind default, grid column — each with the refresh it owes. |
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
| `view/grid-columns.ts` | `resolveColumns(), resolveFieldCompares(), resolveGanttFields()` | Bridges the consumer's `gridColumns` input and field declarations to layout's `ResolvedColumn[]` model. |
| `view/bar-labels.ts` | `resolveBarLabelText(), resolveBarLabelPolicy()` | Bridges the Gantt's own `barLabels` and a row's own variant `barLabels` to a Field — the bar's own `resolveColumns` (#421 C5). |
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
| `view/theme.ts` | `resolveTheme(), ResolvedTheme, MatchMedia` | Theme resolution (#330). The consumer states `Theme` (`'auto'`, `'light'`, `'dark'`); `ResolvedTheme` is what is actually painted once `'auto'` settles. Reads the nearest ancestor's `data-fg-theme`, so a wrapping app's pin reaches every Gantt inside it (#271). |
| `view/variant-styles.ts` | `attachVariantStyles(), VariantStyles` | The second stylesheet a Gantt writes (ADR 0022 §5): the rules behind an installed Variant's own class. One node per Gantt, never one shared refcounted node per document (I2) — disposing one Gantt removes exactly its own rules. |
| `view/grid-pane-width.ts` | `GridPaneWidth, GridWidth, GridPaneWidthPorts` | The grid pane's width rules: the #127 floor, the #139 ceiling over the resolved columns' right edge, and #157's `'fitColumns'` standing instruction that keeps the pane on that edge across every rebind. Split out of `GanttShell` so the rules are testable on their own. |
| `view/entry-selection.ts` | `EntrySelection, EntrySelectionRow, EntrySelectionPorts` | One sentence: given what is selected, what would a click select? ADR 0010's pane rule ran as two switches — one here, one in `interaction/entry-gestures.ts`. Now it runs once, in `view/`, and `interaction/` only ever asks for the answer (#230 R4). Selection holds `EntryId` alone (ADR 0025, #421) — a former Segment is an ordinary child Entry now. |
| `view/roving-focus.ts` | `RovingFocus, RovingFocusRow, RovingFocusPorts` | Which bar a keyboard action lands on (D-S5-39). Restores by key, not by node: a virtualized row's node comes and goes as the window scrolls, but the row it stands for does not. The nudge and resize themselves stay `interaction/keyboard-editing.ts`'s job. |
| `view/live-region.ts` | `LiveRegion, LiveRegionFeed` | One polite live region per Gantt (D-S5-25/D-S5-26). A screen reader announces a change to its text, so this is how a keyboard action reaches a screen-reader user. It subscribes to the Gantt's own `error` event, and grows no second call path for a plugin to reach it through. |
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
| `api/define-plugin.ts` | `definePlugin()` | The one door a plugin author writes a plugin through (ADR 0019). It returns the object it is given; what it adds is the type, so a mistake in the `data` half is a red squiggle in the editor, not a failure at mount. |
| `api/plugin-context.ts` | `PluginContextOf` | What a plugin's `view` half receives (ADR 0019). Generic over the Gantt and Dataset types so `api/` has no import ring; `api/gantt.ts` binds the arguments once as `PluginContext`, which is the name a plugin author writes. |
| `api/dataset-plugin.ts` | `DatasetPluginContextOf, mergeEntryEdits(), moveEntryTo()` | The public Dataset-plugin contract, plus the one legal merge of two extenders' writes. |
| `api/command.ts` | `CommandOf, CommandContextOf, BuiltInCommandId` | The public command and keybinding contract, generic over `TGantt`. |
| `api/attempt-mutation.ts` | `attemptMutation()` | Runs a mutating body and returns `false` when `beforeChange` refuses, instead of throwing. |
| `api/watch-all-errors.ts` | `watchAllErrors()` | One handler over the Dataset `error` feed and the Gantt's, de-duplicated. |
| `api/time-facade.ts` | `formatDate, formatEndInclusive` | Narrow slice of `time/` that `extensions/features/tooltips.ts` needs without importing the public barrel (that barrel re-exports `tooltips`). |
| `api/decoration-facade.ts` | `DecorationLayer, DecorationContext, DecorationInput` | Narrow slice of `layout/`'s decoration vocabulary that `extensions/features/time-shading.ts` needs without importing the public barrel (that barrel re-exports `timeShading`). |
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
| `extensions/features/time-shading-covers.ts` | `TimeCover, DayOfWeek, daysOfWeek(), hours(), dates(), spans(), notCovered(), mergeSpans(), complement(), coarsestFloor()` | The five `TimeCover` builders behind `timeShading()` (#404), plus the span merge/complement they and the rule level share. |
| `extensions/features/time-shading.ts` | `timeShading(), ShadingRule, CoverPredicate` | Shipped plugin that shades regions of the time axis (#404). Ordinary `ChromePlugin`, layer `underBars` always. Every band carries the `.fg-time-shading` Part, themed by the `--fg-time-shading-fill` Token. |
| `extensions/plugin-order.ts` | `resolveSetupOrder(), assertNoDuplicateIds(), OrderedPlugin` | The one place that answers "in what order do plugins set up?" (D-S5-31). ADR 0019 gives a plugin's two halves one `requires` list between them, so the sort belongs to neither install site alone. Generic over the plugin shape — it reads `id` and `requires` and nothing else. |
| `extensions/index.ts` | barrel | Re-exports the runtime, commands, keymap, and the shipped built-ins. |

### not yet written

| file | exports | what it is for |
| --- | --- | --- |
| `scheduling/index.ts` | — | S7. The first-party default plugin's pure engine + the `EditExtender` occupancy. |
