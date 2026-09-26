export { Dataset } from './dataset.js';
export type { DatasetOptions, DatasetPluginContext } from './dataset.js';
// S5.10: the Dataset-plugin contract. The generic shapes behind the Dataset-bound
// aliases above, plus the vocabulary a plugin author names directly — its own store, another
// plugin's read-only view, and the wrapper that composes onto the extension hook.
export type {
  DatasetPluginContextOf,
  DatasetEvents,
  DatasetEditHook,
  DatasetStoreAccess,
  PluginStore,
  PluginStoreView,
  ExtenderWrapper,
  HierarchySource,
  HierarchySourceWrapper,
  FieldLockQuery,
  FieldLockRule,
  FieldLockRuleWrapper,
} from './dataset-plugin.js';
// #197: what that wrapper composes with — the one legal merge of two extenders' writes.
export { mergeEntryEdits } from './dataset-plugin.js';
// ADR 0026 retired the several-Segment case it names: the rigid move a plugin's cascade
// writes honestly, for the one span an Entry has.
export { moveEntryTo } from './dataset-plugin.js';
// The extension hook's own types (D4): a plugin that writes an extender by hand, rather than
// composing one inline, names these. EntryEdit is the write side — what a cascade returns, and what
// `moveEntryTo` builds one of; EntryEdits is the map of those, which `mergeEntryEdits`
// (#197) takes and returns. ProposedEdit is the read side — what `EditRequest.proposed` holds — and
// ProposedEdits is the map of those (#209: a plugin author who reads `request.proposed`, or factors
// a helper over it, needs to name the read side too). WriteTarget is what `EditRequest.writeTarget`
// (#466) answers — a plugin author who reads it needs to name the answer too.
export type {
  EditRequest,
  EditExtender,
  EntryEdits,
  ProposedEdit,
  ProposedEdits,
  WriteTarget,
} from '../model/index.js';
export { attemptMutation } from './attempt-mutation.js';
// S5.12: one handler over the Dataset's `error` feed and the Gantt's, de-duplicated by
// emitter identity. Beside `attemptMutation` because it is the same kind of helper — the boilerplate
// a common consumer job needs, written once.
export { watchAllErrors } from './watch-all-errors.js';
export type { ErrorFeed } from './watch-all-errors.js';
// The Error report itself. A notification record a consumer subscribes to, never something
// they catch — `FreeGanttError` above is the class you catch.
export type {
  ErrorReport,
  ErrorReportInput,
  BuiltInReportCode,
  ReportCode,
  ErrorSeverity,
  ErrorReporter,
  GestureDroppedReason,
  Refusable,
  PluginErrorReport,
} from '../model/index.js';
export type {
  ChangeSet,
  ChangeSetId,
  ChangeOrigin,
  ReplayOptions,
  StoreName,
  PluginStoreName,
  StoreRowUpdated,
  UpdatedRow,
  CoreFieldKey,
  CoreFieldValues,
  CoreFieldValue,
  FieldKey,
  FieldValue,
  Field,
  FieldEditable,
  FieldType,
  ComputeContext,
  FieldContext,
  FormatContext,
  RollUpContext,
  Aggregator,
  AggregatorName,
  FieldTypeName,
  GridColumn,
  GridColumnInput,
  GridColumnBase,
  GridColumnSizing,
  ColumnAlign,
  ColumnRenderer,
  ColumnRendererContext,
  EntityAdded,
  EntityRemoved,
  FieldUpdated,
  EntryEdit,
  PropsEdit,
  DatasetEventMap,
} from '../model/index.js';
// The consumer-History write path (`plans/s2-data-core/s2b-undo-replay-seam.md`): `invertChangeSet`
// turns a recorded changeset into its undo; `Dataset.replay` writes it back. `data/change-set.js` is a
// submodule of the `data` layer, not the `data` layer boundary itself — `api/` may import it directly.
export { invertChangeSet, fieldRowsOf } from '../data/change-set.js';
export { Gantt } from './gantt.js';
export type {
  GanttOptions,
  GanttOptionsBase,
  GanttScaleOptions,
  DateLineInput,
  DateLine,
  DateLineLabelPlacement,
  ChromePlugin,
  DataPlugin,
  Plugin,
  PluginContext,
  Command,
  CommandContext,
  CommandRegistry,
  CommandTarget,
  ActedOn,
  KeyBinding,
} from './gantt.js';
// The generic shapes behind the Gantt-bound aliases above (S5.1/S5.2). A plugin author writing
// against `Gantt` names the bound forms; code parameterizing over its own Gantt type names these —
// the same `*Of` pairing `api/command.ts`'s and `api/plugin.ts`'s file headers describe.
export type { ChromePluginOf, DataPluginOf, PluginIdentity, PluginOf } from './plugin.js';
export type { PluginContextOf, PluginContextParts } from './plugin-context.js';
// ADR 0019: one plugin, one install site. `definePlugin` narrows to the arm the object fills, so a
// plugin with a `data` half never type-checks into `GanttOptions.plugins`.
export { definePlugin } from './define-plugin.js';
export type {
  BuiltInCommandId,
  ConvenienceCommandId,
  CommandId,
  CommandOf,
  CommandContextOf,
  CommandRegistryOf,
  KeyBindingOf,
} from './command.js';
// One vocabulary for "what did this land on", shared by `CommandTarget.kind` and `DomTarget.kind`
// (review A3).
export type { TargetKind } from '../model/index.js';
export type {
  Theme,
  ResolvedTheme,
  GridWidth,
  ViewportGestures,
  ViewportGestureFlags,
  PointerActivation,
  ConvenienceChords,
  CollapseState,
} from '../view/index.js';
export type {
  GanttEventMap,
  GanttEventHandler,
  GanttEvents,
  AsyncCancelableEvent,
  GridWidthChange,
  GridColumnsChange,
  NavigationChange,
  SelectionChange,
  CollapseChange,
  ThemeChange,
  ProposedDates,
  ProposedSpan,
  EntryGestureEvent,
  EntryMove,
  EntryResize,
  EntryFieldEdit,
  EntryActivate,
} from '../view/index.js';
// S3: `Gantt.capabilities`'s own type and the per-gesture rule shape (`view/capability.ts`).
// #256: `WriteRule` is the shape of `capabilities.edit`, which answers one cell rather than one
// entry, and `WriteVerdict` is what `ctx.interaction.canWrite` hands a plugin back.
export type {
  CapabilityRule,
  Capabilities,
  WriteRefusalReason,
  WriteRule,
  WriteVerdict,
} from '../view/index.js';
// #168 (S5.3; #158): the type of both `PluginContext.view.overlay` and
// `PluginContext.view.rowLayer`. One mount shape, two instances — a plugin builds a `Popup` (or its
// own primitive) against this alone, never against `view/` or `render/` directly.
export type { MountLayer } from '../view/index.js';
// Review N1/A3: the plugin-to-DOM seam. `ctx.view.dom` carries `GanttDom`; `targetUnder` answers
// with a `DomTarget`; `onDomEvent` takes a `DomEventHandler` and `DomEventOptions`.
export type { GanttDom, DomTarget, PaneName, DomEventHandler, DomEventOptions } from '../view/index.js';
// S5.3: the anchoring/flipping/clamping/dismissal primitive tooltips, the context menu and
// the cell editor (S5.5+) all build on. C3 (`plans/reviews/2026-09-02-s5-start-fixes.md`) folded its
// Escape dismissal into the shared keymap (the "innermost popup wins" rule needs the same
// newest-first resolver core commands and plugin keybindings use) — `createPopup` now takes a
// `RegisterKeyHandler` as a second argument, and a plugin author passes the same bound method it
// already had: `ctx.interaction.registerKeyHandler`.
export { createPopup } from '../extensions/popup.js';
export type { RegisterKeyHandler, KeyEventLike } from '../extensions/keymap.js';
export type {
  Popup,
  PopupOptions,
  PopupPlacement,
  PopupSurface,
  DismissTrigger,
  Anchor,
} from '../extensions/popup.js';
// S5.5: the two shipped built-ins — values a consumer imports (`plugins: [tooltips(),
// contextMenu({ items })]`), never names in a config table (README §0). Both live in
// `src/extensions/features/`, confined to this same public surface by the `extensions-public-only`
// depcruise rule — `[S5-A1]`'s dogfood gate.
export { tooltips } from '../extensions/features/tooltips.js';
export type { TooltipsOptions } from '../extensions/features/tooltips.js';
export { contextMenu } from '../extensions/features/context-menu.js';
export type { ContextMenuOptions, MenuItem, MenuEntry } from '../extensions/features/context-menu.js';
// S5.8: the third shipped built-in, same posture as `tooltips()`/`contextMenu()`
// above — a value a consumer imports, confined to the same `extensions-public-only` boundary.
export { inlineEditing } from '../extensions/features/inline-editing.js';
export type {
  InlineEditingOptions,
  DateInput,
  DateInputFactory,
} from '../extensions/features/inline-editing.js';
// #404: the fourth shipped built-in, same posture as the three above — a value a consumer imports
// (`plugins: [timeShading([{ covers: daysOfWeek(6, 7) }])]`), confined to the same
// `extensions-public-only` boundary. `daysOfWeek`/`hours`/`dates`/`spans`/`notCovered` are the
// `TimeCover` builders a rule's `covers` names; `TimeCover` itself is public only so a consumer can
// write one by hand for a calendar no builder covers.
export { timeShading } from '../extensions/features/time-shading.js';
export type { ShadingRule, CoverPredicate } from '../extensions/features/time-shading.js';
export { daysOfWeek, hours, dates, spans, notCovered } from '../extensions/features/time-shading-covers.js';
export type { TimeCover, DayOfWeek } from '../extensions/features/time-shading-covers.js';
// TimeScaleModel/ScrollAxis are layout/'s own — both are public, consumer-constructed objects
// (D9), so this re-exports straight from their owning layer rather than laundering them through
// view/, which has no other interest in them (issue #91 §9-I).
export { TimeScaleModel, ScrollAxis } from '../layout/index.js';
export type {
  TimeScale,
  TimeScaleModelOptions,
  TimeScaleFit,
  TimeUnitWidth,
  PresetRef,
  PresetId,
  ShippedPresetId,
  ScrollAxisState,
  ScrollAxes,
  Overscan,
} from '../layout/index.js';
// Catchable errors (plans/02 §7): FreeGanttError is the base; a consumer can catch broadly or on `.code`.
// `BuiltInThrownCode` names every code a consumer can catch, so a `switch` on `.code` is exhaustive;
// `ThrownCode` is that plus a consumer's own, for a subclass they write themselves.
export type { BuiltInThrownCode, ThrownCode } from '../model/index.js';
// `InvalidInstantError.reason`'s closed set (#242) — exported so a consumer can branch on it by type,
// not just read it off a caught error.
export type { InvalidInstantReason } from '../model/index.js';
export {
  FreeGanttError,
  UnsupportedUnitError,
  InvalidSnapIncrementError,
  ContainerNotFoundError,
  InvalidInstantError,
  InvalidPlainTimeError,
  UnknownPresetError,
  InvalidPresetError,
  EntryNotFoundError,
  RevealTargetNotFoundError,
  DuplicateEntryIdError,
  ParentCycleError,
  EmptyCoversError,
  InvertedSpanError,
  SiblingIndexOutOfRangeError,
  UnknownFieldError,
  UnknownGridColumnError,
  DuplicateFieldKeyError,
  DuplicatePropsKeyError,
  ReservedFieldKeyError,
  IllegalCoreFieldOverrideError,
  ComputedFieldCannotBeWrittenError,
  FieldNotEditableError,
  DerivedFieldNotWritableError,
  UnknownAggregatorError,
  AggregatorFailedError,
  UnknownFieldTypeError,
  FieldColumnNotDefinedError,
  DuplicateRowIdError,
  MutationDuringNotificationError,
  MutationDuringExtensionHookError,
  TransactionAlreadyOpenError,
  MutationCancelledError,
  UnreadableCellValueError,
  InvalidReplayOriginError,
  DuplicatePluginIdError,
  PluginNotInstalledError,
  MissingPluginError,
  PluginRequirementCycleError,
  RegistrationClosedError,
  PluginSetupError,
  UnknownCommandError,
  RendererAlreadyRegisteredError,
  CustomRowSourceNotFilterableOrSortableError,
} from '../model/index.js';

// model/ types the public surface re-exports. A consumer building entries or catching errors names these.
export {
  entryId,
  barId,
  barIdFromDataset,
  entryIdFromDataset,
  entryIdOfBar,
  partIndexOfBar,
  changeSetId,
} from '../model/index.js';
export type { PluginId, Disposer, KeyChord } from '../model/index.js';
// S5.1: `PluginContext.disposables`'s own type — a plugin author's cleanup list.
export type { DisposableStore } from '../extensions/disposables.js';
export type {
  Entry,
  StoredEntry,
  EntryId,
  RowId,
  BarId,
  Instant,
  TimeUnit,
  TimeSpan,
  Duration,
  DurationMeasure,
  EntryStoreView,
  EntryStore,
} from '../model/index.js';
// The input twins of the stored types: what a consumer writes, as opposed to what the library stores.
// Public because a consumer that types its own entry builder needs to name them. FlatEntryInput is
// what `entries.add()` and `DatasetOptions.entries` actually take (#281) — a declared Field key sits
// flat, the same shape `update()` takes; EntryInput stays the nested-`props`-only shape `entry.toInput()`
// hands back.
export type {
  EntryInput,
  FlatEntryInput,
  EntryDelta,
  InstantInput,
  TimeSpanInput,
  DateOnlyEndRule,
  PlainTimeInput,
} from '../model/index.js';
export type {
  RowSource,
  EntriesRowSource,
  GroupRowSource,
  CustomRowSource,
  CustomRow,
  RowSourceCommon,
  CustomRowInput,
  RowFilter,
  RowSort,
  FilterPolicy,
} from '../layout/index.js';
// What `Gantt.rowSource` reads back (#248 S4-2) — every key above a consumer may omit, filled.
export type { ResolvedRowSource, ResolvedEntriesRowSource, ResolvedGroupRowSource } from '../layout/index.js';
// General geometry vocabulary (model/geometry.ts) — the public surface's own shapes for a point or
// a box, alongside `ClientPoint`/`PixelSpan` below.
export type { Point, Size, ClientPoint, PixelSpan } from '../model/index.js';
// S5.3: `ctx.view.renderElement()`'s own input type — the reconciler's vocabulary as plain data.
export type { ElementDescription, TooltipColumn } from '../model/index.js';
// S5.4: renderer callback vocabulary — `GanttOptions.barRenderer`/etc. and
// `ctx.view.registerRenderer(point, renderer)` both type against these. `FrameBar`/`FrameRow`/
// `ResolvedColumn` ride along because the context types name them (`BarRendererContext.bar`,
// `GridCellRendererContext.row`/`column`) — a consumer writing its own named `BarRenderer` needs them
// importable, not just structurally inferred.
export type {
  RendererPoint,
  RendererFor,
  BarRenderer,
  BarRendererContext,
  BarLabels,
  BarLabelPolicy,
  BarLabelSpec,
  BarLabelPlacement,
  ResolvedBarLabel,
  GridCellRenderer,
  GridCellRendererContext,
  HeaderRenderer,
  HeaderRendererContext,
  TooltipRenderer,
  TooltipRendererContext,
  FrameBar,
  FrameRow,
  ResolvedColumn,
  FrameColumn,
  BarFlags,
  BarSpanKind,
  PlannedRowKind,
} from '../layout/index.js';
// The closed `data-flag` key set behind `BarFlags` (#475) — a consumer writing a stylesheet
// selector or a `barRenderer` reads the same list `flagTokens` iterates. `LINK_FLAG_KEYS` stays
// layout-internal (NEW-3/#481 review): `GeometryFrame.links` always emits `[]` until links paint
// (S7), no renderer reads it, and no stylesheet has a `.fg-link` rule, so a consumer styling
// against it today would write CSS that matches nothing.
export { BAR_FLAG_KEYS } from '../layout/index.js';
// S5.6: a decoration provider's own vocabulary — a plugin author writes `ctx.view
// .registerDecoration('underBars', (ctx) => [...])` against these alone. `RangeBand`/`RowStripe`
// are the same pixel-resolved shapes `GeometryFrame.underBars`/`.overBars` carry.
export type {
  DecorationLayer,
  DecorationContext,
  DecorationProvider,
  DecorationInput,
  RangeBand,
  RowStripe,
} from '../layout/index.js';
// ADR 0018: `EntryVariant.bars`'s own vocabulary — a plugin author naming `BarProducer`
// explicitly, the same reason `BarRenderer`/`DecorationProvider` above are exported rather than left
// to structural inference.
export type { Bar, BarProducer, BarAnchor, FixedBarBox } from '../layout/index.js';
// ADR 0018: one variant is one object, and `GanttOptions.variants` and `ctx.variants.add` both take
// it. `EntryRule` is published beside it because an author cannot guess what `when` matches;
// `EntryPredicate` names its predicate arm alone. Named for what they match — an Entry — rather than
// for one of the two keys that take them: `EntriesRowSource.childrenAsSegments` takes the same shape
// (#421).
export type { EntryVariant, EntryRule, EntryPredicate, FieldMatch } from '../layout/index.js';
// ADR 0022 §3: `gantt.variantFor(entry)` answers this — the whole variant, not a name a caller
// looks up again.
export type { ResolvedVariant } from '../layout/index.js';
// Review P3: the common producer, so `(entry) => [wholeEntryBar(entry)]` replaces eight hand-written
// lines — and the Bar id convention has one owner instead of one copy per plugin.
export { wholeEntryBar } from '../layout/index.js';
// ADR 0022: the producer for a marker that must hold its size at every zoom — `diamond()`'s glyph is
// the shipped case. `barSpan` honours the Bar's `box` ahead of the span-and-floor path.
export { fixedWidthBar } from '../layout/index.js';
// ADR 0023, ADR 0026: `EntryVariant.bars`'s own default — a variant with no `bars` key gets this one
// Bar producer, and `summary()` states it explicitly too, for the same reason `BarProducer` itself is
// exported above (an author naming it directly on a variant of their own).
export { wholeSpanUnlessSegments } from '../layout/index.js';
// ADR 0022 §1: core's three shipped looks, as factories over `EntryVariant` rather than private
// object literals — `variants: [summary({ when: myRule })]` reuses core's rail instead of
// hand-building `.fg-bar-summary` again. `diamond()` is not seeded into any Gantt; no row wears it
// until an author installs it. `bar` and `summary` keep their plain names on purpose — the three read
// as one family at a call site — see `bar()`'s own note in `layout/bars/variants.ts`.
export { bar, summary, diamond } from '../layout/index.js';
// #265: shipped Grid-column cell renderers. `meter()` paints a percent as a
// track. `image()` paints a stored URL as an img. Both take `()`, the
// same factory shape as `diamond()`. `columnRenderer` stays on the Gantt
// column itself.
export { meter, image } from '../layout/index.js';
// #264: a currency Field type is a factory, not a seeded name — `{ key: 'cost', type: currency({
// code: 'EUR' }) }`. Consumers name `percent` / `text` / `number` with the string; those stay off
// this barrel.
export { currency } from '../data/fields/field-types.js';

// Time helpers a caller needs: `instant` for a pinned `TimeSpan`, `now` for "this Instant",
// `addMs`/`MS` to shift one by a duration (S2.7 harness-review — `harness/e2e/data.ts`'s move-by-a-day
// buttons had no public way to do this and were hand-rolling `entry.start + 86400000`; the Add-entry
// button then used `instant(Date.now())` the same way). `diffMs` is `addMs`'s pair, added in S5.10
// for the same reason: `harness/plugins/lock-entries.ts` reads how far a proposed edit moved an
// entry, and subtracting two `Instant`s by hand is exactly the arithmetic I10 exists to stop.
// `overlap` clips one `TimeSpan` to another, added in #472 for the same reason: a consumer totalling
// a Field over `gantt.visibleSpan` had no public way to clip an entry's span to the window without
// the same hand `Math.max`/`Math.min`-and-cast.
// Named preset constants and `resolvePreset` stay internal — resolving a `PresetRef` is core's job.
export {
  presets,
  instant,
  now,
  addMs,
  diffMs,
  overlap,
  MS,
  formatDate,
  formatEndInclusive,
  formatWeekNumber,
  formatHour,
  isTimeUnit,
  isCoarserThan,
  // #489: the tick tools the library's own grid and drag-snap read, published so a custom `SnapRule`
  // (below) or a hand-rolled Cursor-line label can build on the same calendar math instead of
  // re-deriving it. `snapInstant` answers "which drawn tick is `at` nearest to"; `nextTickBoundary`
  // answers "where's the next one strictly after `at`" — the arm-a-timer question `snapInstant`
  // alone can't, since it may answer `at`'s own tick.
  snapInstant,
  nextTickBoundary,
} from '../time/index.js';
export type {
  ViewPreset,
  ViewPresetHeader,
  SnapSetting,
  SnapUnit,
  SnapRule,
  Tick,
  TickStep,
  DateFormat,
  HeaderFormat,
} from '../time/index.js';
// S5.6: `Dataset.time`'s own type — a plugin author names this when it writes a function
// that takes a `ZonedTime` rather than reading `ctx.time`/`dataset.time` inline. `PlainParts` rides
// along: `ZonedTime.toPlain`/`.fromPlain` both name it.
export type { ZonedTime, PlainParts } from '../time/index.js';
