export { Dataset } from './dataset.js';
export type { DatasetOptions, DatasetHierarchy, DatasetPlugin, DatasetPluginContext } from './dataset.js';
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
// The extension hook's own two types (D4, D-S2-6): a plugin that writes an extender by hand, rather
// than composing one inline, names these.
export type { EditRequest, EditExtender } from '../model/index.js';
export type { RollUpKinds } from '../model/index.js';
export { attemptMutation } from './attempt-mutation.js';
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
  FieldSource,
  FieldContext,
  FormatContext,
  RollUpContext,
  Aggregator,
  AggregatorName,
  FieldTypeName,
  GridColumn,
  GridColumnInput,
  ColumnAlign,
  ColumnCellRenderer,
  ColumnCellRendererContext,
  EntityAdded,
  EntityRemoved,
  FieldUpdated,
  EntryEdit,
  DatasetEventMap,
} from '../model/index.js';
// The consumer-History write path (`plans/s2-data-core/s2b-undo-replay-seam.md`): `invertChangeSet`
// turns a recorded changeset into its undo; `Dataset.replay` writes it back. `data/change-set.js` is a
// submodule of the `data` layer, not the `data` layer boundary itself — `api/` importing it directly
// matches `api/dataset.ts`'s own import of `data/serialization/index.js`.
export { invertChangeSet, fieldRowsOf } from '../data/change-set.js';
export { Gantt } from './gantt.js';
export type {
  GanttOptions,
  GanttOptionsBase,
  GanttScaleOptions,
  DateLineInput,
  GanttPlugin,
  PluginContext,
  Command,
  CommandContext,
  CommandRegistry,
  CommandTarget,
  KeyBinding,
} from './gantt.js';
// The generic shapes behind the Gantt-bound aliases above (S5.1/S5.2). A plugin author writing
// against `Gantt` names the bound forms; code parameterizing over its own Gantt type names these —
// the same `*Of` pairing `api/command.ts`'s and `api/plugin.ts`'s file headers describe.
export type { GanttPluginOf, PluginContextOf } from './plugin.js';
export type { CommandOf, CommandContextOf, CommandRegistryOf, KeyBindingOf } from './command.js';
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
export type { CapabilityRule, Interactions, KindDefaults } from '../view/index.js';
// S5.3, D-S5-8: `PluginContext.view.overlay`'s own type — a plugin builds a `Popup` (or its own
// primitive) against this alone, never against `view/` or `render/` directly.
export type { Overlay, OverlayHandle } from '../view/index.js';
// #158: `PluginContext.view.rowLayer`'s own type — the mount seam for content that must scroll with
// the rows instead of floating over them (the cell editor).
export type { RowLayer } from '../view/index.js';
// Review N1/A3: the plugin-to-DOM seam. `ctx.view.dom` carries `GanttDom`; `targetUnder` answers
// with a `DomTarget`; `onDomEvent` takes a `DomEventHandler` and `DomEventOptions`.
export type { GanttDom, DomTarget, DomEventHandler, DomEventOptions } from '../view/index.js';
// S5.3, D-S5-8: the anchoring/flipping/clamping/dismissal primitive tooltips, the context menu and
// the cell editor (S5.5+) all build on. C3 (`plans/reviews/2026-09-02-s5-start-fixes.md`) folded its
// Escape dismissal into the shared keymap (D-S5-9's "the innermost popup wins" needs the same
// newest-first resolver core commands and plugin keybindings use) — `createPopup` now takes a
// `KeyHandlerRegistrar` as a second argument, and a plugin author builds one from the same seam it
// already had: `{ registerHandler: ctx.interaction.registerKeyHandler }`.
export { createPopup } from '../extensions/popup.js';
export type { KeyHandlerRegistrar, KeyEventLike } from '../extensions/keymap.js';
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
  ContainerNotFoundError,
  InvalidInstantError,
  UnknownPresetError,
  InvalidPresetError,
  EntryNotFoundError,
  DuplicateEntryIdError,
  ParentCycleError,
  SegmentsOutOfSyncError,
  UnknownFieldError,
  DuplicateFieldKeyError,
  DuplicateFieldSourceError,
  UnknownAggregatorError,
  AggregatorFailedError,
  UnknownFieldTypeError,
  FieldNotColumnableError,
  DuplicateRowIdError,
  MutationDuringNotificationError,
  MutationCancelledError,
  InvalidReplayOriginError,
  UnsupportedSchemaError,
  DuplicatePluginIdError,
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
  EntryKind,
  EntryId,
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
export type { EntryInput, InstantInput, TimeSpanInput, DateOnlyEndRule } from '../model/index.js';
export type { DatasetDocument, EntryDocument, SerializedField, PluginDocument } from '../model/index.js';
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
// Point/Size are the S1.5 ScrollModel's own vocabulary (S1.5 README §5) — a consumer building
// `new ScrollModel({ x, y })` or reading `ScrollState` needs the shape in the public surface too.
export type { Point, Size, ClientPoint, PixelSpan } from '../model/index.js';
// S5.3, D-S5-10: `Overlay.render()`'s own input type — the reconciler's vocabulary as plain data.
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
  RendererByKind,
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
} from '../time/index.js';
export type {
  ViewPreset,
  ViewPresetHeader,
  Tick,
  TickStep,
  DateFormat,
  HeaderFormat,
} from '../time/index.js';
// S5.6, D-S5-16: `Dataset.time`'s own type — a plugin author names this when it writes a function
// that takes a `ZonedTime` rather than reading `ctx.time`/`dataset.time` inline. `PlainParts` rides
// along: `ZonedTime.toPlain`/`.fromPlain` both name it.
export type { ZonedTime, PlainParts } from '../time/index.js';
