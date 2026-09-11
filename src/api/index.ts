export { Dataset } from './dataset.js';
export type { DatasetOptions, DatasetPlugin, DatasetPluginContext } from './dataset.js';
// S5.10, D-S5-23/24/30/31: the Dataset-plugin contract. The generic shapes behind the Dataset-bound
// aliases above, plus the vocabulary a plugin author names directly — its own store, another
// plugin's read-only view, and the wrapper that composes onto the extension hook.
export type {
  DatasetPluginOf,
  DatasetPluginContextOf,
  DatasetEvents,
  DatasetFieldRegistrations,
  DatasetEditHook,
  DatasetStoreAccess,
  PluginStore,
  PluginStoreView,
  ExtenderWrapper,
} from './dataset-plugin.js';
// #197: what that wrapper composes with — the one legal merge of two extenders' writes.
export { mergeEntryEdits } from './dataset-plugin.js';
// D-S5-44: the rigid move a plugin's cascade writes honestly, instead of a several-Segment
// envelope-only write `data/` refuses.
export { moveEntryTo } from './dataset-plugin.js';
// The extension hook's own types (D4, D-S2-6): a plugin that writes an extender by hand, rather than
// composing one inline, names these. EntryEdit is the write side — what a cascade returns, and what
// `moveEntryTo` (D-S5-50) builds one of; EntryEdits is the map of those, which `mergeEntryEdits`
// (#197) takes and returns. ProposedEdit is the read side — what `EditRequest.proposed` holds — and
// ProposedEdits is the map of those (#209 Q1: a plugin author who reads `request.proposed`, or factors
// a helper over it, needs to name the read side too).
export type { EditRequest, EditExtender, EntryEdits, ProposedEdit, ProposedEdits } from '../model/index.js';
export { attemptMutation } from './attempt-mutation.js';
// S5.12, D-S5-42: one handler over the Dataset's `error` feed and the Gantt's, de-duplicated by
// emitter identity. Beside `attemptMutation` because it is the same kind of helper — the boilerplate
// a common consumer job needs, written once.
export { watchAllErrors } from './watch-all-errors.js';
export type { ErrorFeed } from './watch-all-errors.js';
// The Error report itself (D-S5-40). A notification record a consumer subscribes to, never something
// they catch — `FreeGanttError` above is the class you catch.
export type {
  ErrorReport,
  ErrorReportInput,
  BuiltInErrorCode,
  ErrorCode,
  ErrorSeverity,
  ErrorReporter,
  Refusable,
  PluginErrorReport,
} from '../model/index.js';
export type {
  ChangeSet,
  ChangeSetId,
  ChangeOrigin,
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
  FieldType,
  FieldContext,
  FormatContext,
  RollUpContext,
  Aggregator,
  FieldDistributor,
  AggregatorName,
  FieldTypeName,
  GridColumn,
  GridColumnInput,
  GridColumnBase,
  GridColumnSizing,
  ColumnAlign,
  ColumnCellRenderer,
  ColumnCellRendererContext,
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
  GanttPlugin,
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
export type { GanttPluginOf, PluginContextOf, PluginContextParts } from './plugin.js';
export type {
  BuiltInCommandId,
  CommandId,
  CommandOf,
  CommandContextOf,
  CommandRegistryOf,
  KeyBindingOf,
} from './command.js';
// One vocabulary for "what did this land on", shared by `CommandTarget.kind` and `DomTarget.kind`
// (review A3).
export type { TargetKind } from '../model/index.js';
export type { Theme, GridWidth, ViewportGestures, ViewportGestureFlags } from '../view/index.js';
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
  ProposedSpan,
  EntryGestureEvent,
  EntryMove,
  EntryResize,
  EntryFieldEdit,
} from '../view/index.js';
// S3, D-S3-9: `Gantt.interactions`'s own type and the per-gesture rule shape (`view/capability.ts`).
// #256: `WriteRule` is the shape of `interactions.edit`, which answers one cell rather than one
// entry, and `WriteVerdict` is what `ctx.interaction.canWrite` hands a plugin back.
export type {
  CapabilityRule,
  Interactions,
  KindDefaults,
  WriteRefusalReason,
  WriteRule,
  WriteVerdict,
} from '../view/index.js';
// #168 (S5.3, D-S5-8; #158): the type of both `PluginContext.view.overlay` and
// `PluginContext.view.rowLayer`. One mount shape, two instances — a plugin builds a `Popup` (or its
// own primitive) against this alone, never against `view/` or `render/` directly.
export type { MountLayer } from '../view/index.js';
// Review N1/A3: the plugin-to-DOM seam. `ctx.view.dom` carries `GanttDom`; `targetUnder` answers
// with a `DomTarget`; `onDomEvent` takes a `DomEventHandler` and `DomEventOptions`.
export type { GanttDom, DomTarget, PaneName, DomEventHandler, DomEventOptions } from '../view/index.js';
// S5.3, D-S5-8: the anchoring/flipping/clamping/dismissal primitive tooltips, the context menu and
// the cell editor (S5.5+) all build on. C3 (`plans/reviews/2026-09-02-s5-start-fixes.md`) folded its
// Escape dismissal into the shared keymap (D-S5-9's "the innermost popup wins" needs the same
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
// S5.5, D-S5-13/14: the two shipped built-ins — values a consumer imports (`plugins: [tooltips(),
// contextMenu({ items })]`), never names in a config table (Q3, README §0). Both live in
// `src/extensions/features/`, confined to this same public surface by the `extensions-public-only`
// depcruise rule — `[S5-A1]`'s dogfood gate.
export { tooltips } from '../extensions/features/tooltips.js';
export type { TooltipsOptions } from '../extensions/features/tooltips.js';
export { contextMenu } from '../extensions/features/context-menu.js';
export type { ContextMenuOptions, MenuItem, MenuEntry } from '../extensions/features/context-menu.js';
// S5.8, D-S5-19/D-S5-20: the third shipped built-in, same posture as `tooltips()`/`contextMenu()`
// above — a value a consumer imports, confined to the same `extensions-public-only` boundary.
export { inlineEditing } from '../extensions/features/inline-editing.js';
export type {
  InlineEditingOptions,
  DateInput,
  DateInputFactory,
} from '../extensions/features/inline-editing.js';
// TimeScaleModel/ScrollModel are layout/'s own — both are public, consumer-constructed objects
// (D9), so this re-exports straight from their owning layer rather than laundering them through
// view/, which has no other interest in them (issue #91 §9-I).
export { TimeScaleModel, ScrollModel } from '../layout/index.js';
export type {
  TimeScale,
  TimeScaleModelOptions,
  TimeScaleFit,
  PresetRef,
  ShippedPresetId,
  ScrollPosition,
  ScrollState,
} from '../layout/index.js';
// Catchable errors (plans/02 §7): FreeGanttError is the base; a consumer can catch broadly or on `.code`.
export {
  FreeGanttError,
  UnsupportedUnitError,
  InvalidSnapIncrementError,
  ContainerNotFoundError,
  InvalidInstantError,
  UnknownPresetError,
  InvalidPresetError,
  EntryNotFoundError,
  SegmentNotFoundError,
  RevealTargetNotFoundError,
  DuplicateEntryIdError,
  DuplicateSegmentIdError,
  ParentCycleError,
  SegmentsOutOfSyncError,
  EmptySegmentsError,
  InvertedSpanError,
  UnknownFieldError,
  UnknownGridColumnError,
  DuplicateFieldKeyError,
  DuplicatePropsKeyError,
  ReservedFieldKeyError,
  IllegalCoreFieldOverrideError,
  ComputedFieldCannotBeWrittenError,
  DerivedFieldNotWritableError,
  UnknownAggregatorError,
  AggregatorFailedError,
  UnknownFieldTypeError,
  FieldNotColumnableError,
  DuplicateRowIdError,
  MutationDuringNotificationError,
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
} from '../model/index.js';

// model/ types the public surface re-exports. A consumer building entries or catching errors names these.
export {
  entryId,
  itemId,
  itemIdFromDataset,
  entryIdFromDataset,
  entryIdOfItem,
  segmentIndexOfItem,
  changeSetId,
} from '../model/index.js';
export type { PluginId, Disposer, KeyChord } from '../model/index.js';
// S5.1, D-S5-1: `PluginContext.disposables`'s own type — a plugin author's cleanup list.
export type { DisposableStore } from '../extensions/disposables.js';
export type {
  Entry,
  EntryId,
  Segment,
  SegmentId,
  RowId,
  ItemId,
  Instant,
  TimeUnit,
  TimeSpan,
  Duration,
  EntryStoreView,
  EntryStore,
} from '../model/index.js';
// The input twins of the stored types: what a consumer writes, as opposed to what the library stores.
// Public because a consumer that types its own entry builder needs to name them.
export type {
  EntryInput,
  SegmentInput,
  InstantInput,
  TimeSpanInput,
  DateOnlyEndRule,
} from '../model/index.js';
export type {
  RowSource,
  EntriesRowSource,
  GroupRowSource,
  CustomRowSource,
  CustomRow,
  RowSourceCommon,
  RowHeightMode,
  CustomRowInput,
  RowFilter,
  RowSort,
  FilterPolicy,
} from '../layout/index.js';
// What `Gantt.rowSource` reads back (#248 S4-2) — every key above a consumer may omit, filled.
export type {
  ResolvedRowSource,
  ResolvedEntriesRowSource,
  ResolvedGroupRowSource,
  ResolvedCustomRowSource,
} from '../layout/index.js';
// Point/Size are the S1.5 ScrollModel's own vocabulary (S1.5 README §5) — a consumer building
// `new ScrollModel({ x, y })` or reading `ScrollState` needs the shape in the public surface too.
export type { Point, Size, ClientPoint, PixelSpan } from '../model/index.js';
// S5.3, D-S5-10: `ctx.view.renderElement()`'s own input type — the reconciler's vocabulary as plain data.
export type { ElementDescription, TooltipColumn } from '../model/index.js';
// S5.4, D-S5-11/12: renderer callback vocabulary — `GanttOptions.barRenderer`/etc. and
// `ctx.view.registerRenderer(point, renderer)` both type against these. `FrameBar`/`FrameRow`/
// `ResolvedColumn` ride along because the context types name them (`BarRendererContext.item`,
// `CellRendererContext.row`/`column`) — a consumer writing its own named `BarRenderer` needs them
// importable, not just structurally inferred.
export type {
  RendererPoint,
  RendererFor,
  BarRenderer,
  BarRendererContext,
  BarLabels,
  BarLabelPlacement,
  ResolvedBarLabel,
  RendererByLook,
  CellRenderer,
  CellRendererContext,
  HeaderRenderer,
  HeaderRendererContext,
  TooltipRenderer,
  TooltipRendererContext,
  FrameBar,
  FrameRow,
  ResolvedColumn,
  FrameColumn,
  BarFlags,
  PlannedRowKind,
} from '../layout/index.js';
// S5.6, D-S5-15: a decoration provider's own vocabulary — a plugin author writes `ctx.view
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
// S5.9, D-S5-22: `ctx.layout.registerItemProducer(kind, producer)`'s own vocabulary — a plugin
// author naming `ItemProducer` explicitly, the same reason `BarRenderer`/`DecorationProvider` above
// are exported rather than left to structural inference.
export type { Item, ItemProducer } from '../layout/index.js';
// Review P3: the common producer, so `(entry) => [wholeEntryItem(entry)]` replaces eight hand-written
// lines — and the Item id convention has one owner instead of one copy per plugin.
export { wholeEntryItem } from '../layout/index.js';

// Time helpers a caller needs: `instant` for a pinned `TimeSpan`, `now` for "this Instant",
// `addMs`/`MS` to shift one by a duration (S2.7 harness-review — `harness/data.ts`'s move-by-a-day
// buttons had no public way to do this and were hand-rolling `entry.start + 86400000`; the Add-entry
// button then used `instant(Date.now())` the same way). `diffMs` is `addMs`'s pair, added in S5.10
// for the same reason: `harness/plugins/lock-entries.ts` reads how far a proposed edit moved an
// entry, and subtracting two `Instant`s by hand is exactly the arithmetic I10 exists to stop.
// Named preset constants and `resolvePreset` stay internal — resolving a `PresetRef` is core's job.
export {
  presets,
  instant,
  now,
  addMs,
  diffMs,
  MS,
  formatDate,
  formatEndInclusive,
  formatWeekNumber,
  formatHour,
  isTimeUnit,
} from '../time/index.js';
export type {
  ViewPreset,
  ViewPresetHeader,
  SnapSetting,
  Tick,
  TickStep,
  DateFormat,
  HeaderFormat,
} from '../time/index.js';
// S5.6, D-S5-16: `Dataset.time`'s own type — a plugin author names this when it writes a function
// that takes a `ZonedTime` rather than reading `ctx.time`/`dataset.time` inline. `PlainParts` rides
// along: `ZonedTime.toPlain`/`.fromPlain` both name it.
export type { ZonedTime, PlainParts } from '../time/index.js';
