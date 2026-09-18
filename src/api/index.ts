export { Dataset } from './dataset.js';
export type { DatasetOptions, DatasetPluginContext } from './dataset.js';
// S5.10, D-S5-23/24/30/31: the Dataset-plugin contract. The generic shapes behind the Dataset-bound
// aliases above, plus the vocabulary a plugin author names directly — its own store, another
// plugin's read-only view, and the wrapper that composes onto the extension hook.
export type {
  DatasetPluginContextOf,
  DatasetEvents,
  DatasetFieldRegistrations,
  DatasetEditHook,
  DatasetHierarchy,
  DatasetStoreAccess,
  PluginStore,
  PluginStoreView,
  ExtenderWrapper,
  HierarchySource,
  HierarchySourceWrapper,
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
  FieldDistributor,
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
} from '../view/index.js';
// S3, D-S3-9: `Gantt.capabilities`'s own type and the per-gesture rule shape (`view/capability.ts`).
// #256: `WriteRule` is the shape of `capabilities.edit`, which answers one cell rather than one
// entry, and `WriteVerdict` is what `ctx.interaction.canWrite` hands a plugin back.
export type {
  CapabilityRule,
  Capabilities,
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
  PresetRef,
  ShippedPresetId,
  ScrollAxisState,
  ScrollAxes,
} from '../layout/index.js';
// Catchable errors (plans/02 §7): FreeGanttError is the base; a consumer can catch broadly or on `.code`.
// `BuiltInThrownCode` names every code a consumer can catch, so a `switch` on `.code` is exhaustive;
// `ThrownCode` is that plus a consumer's own, for a subclass they write themselves.
export type { BuiltInThrownCode, ThrownCode } from '../model/index.js';
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
  SegmentNotFoundError,
  RevealTargetNotFoundError,
  DuplicateEntryIdError,
  DuplicateSegmentIdError,
  ParentCycleError,
  SegmentsOutOfSyncError,
  EmptySegmentsError,
  EmptyCoversError,
  InvertedSpanError,
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
  StoredEntry,
  EntryId,
  Segment,
  SegmentId,
  RowId,
  ItemId,
  Instant,
  TimeUnit,
  TimeSpan,
  Duration,
  DurationMeasure,
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
// S5.3, D-S5-10: `ctx.view.renderElement()`'s own input type — the reconciler's vocabulary as plain data.
export type { ElementDescription, TooltipColumn } from '../model/index.js';
// S5.4, D-S5-11/12: renderer callback vocabulary — `GanttOptions.barRenderer`/etc. and
// `ctx.view.registerRenderer(point, renderer)` both type against these. `FrameBar`/`FrameRow`/
// `ResolvedColumn` ride along because the context types name them (`BarRendererContext.item`,
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
// ADR 0018: `EntryVariant.items`'s own vocabulary — a plugin author naming `ItemProducer`
// explicitly, the same reason `BarRenderer`/`DecorationProvider` above are exported rather than left
// to structural inference.
export type { Item, ItemProducer, BarAnchor, FixedBarBox } from '../layout/index.js';
// ADR 0018: one variant is one object, and `GanttOptions.variants` and `ctx.variants.add` both take
// it. `EntryRule` is published beside it because an author cannot guess what `when` matches (J6);
// `EntryPredicate` names its predicate arm alone. Named for what they match — an Entry — rather than
// for one of the two keys that take them: `EntriesRowSource.childrenAsSegments` takes the same shape
// (#421 Q30).
export type { EntryVariant, EntryRule, EntryPredicate, FieldMatch } from '../layout/index.js';
// ADR 0022 §3: `gantt.variantFor(entry)` answers this — the whole variant, not a name a caller
// looks up again (F3, `plans/row-redesign/BUILD-LOG.md`).
export type { ResolvedVariant } from '../layout/index.js';
// Review P3: the common producer, so `(entry) => [wholeEntryItem(entry)]` replaces eight hand-written
// lines — and the Item id convention has one owner instead of one copy per plugin.
export { wholeEntryItem } from '../layout/index.js';
// ADR 0022: the producer for a marker that must hold its size at every zoom — `diamond()`'s glyph is
// the shipped case. `barSpan` honours the Item's `box` ahead of the span-and-floor path.
export { fixedWidthItem } from '../layout/index.js';
// ADR 0023: the symmetric pair behind `EntryVariant.items` — a variant with no `items` key gets
// `followSegments`, and `summary()` states `ignoreSegments` explicitly. An author who wants either
// shape on a variant of their own names it the same way: `items: ignoreSegments`.
export { ignoreSegments, followSegments } from '../layout/index.js';
// ADR 0022 §1: core's three shipped looks, as factories over `EntryVariant` rather than private
// object literals — `variants: [summary({ when: myRule })]` reuses core's rail instead of
// hand-building `.fg-bar-summary` again. `diamond()` is not seeded into any Gantt; no row wears it
// until an author installs it. `bar` and `summary` keep their plain names on purpose — the three read
// as one family at a call site — see `bar()`'s own note in `layout/items/variants.ts` (F13).
export { bar, summary, diamond } from '../layout/index.js';
// #265: shipped Grid-column cell renderers. `meter()` paints a percent as a
// track. `image()` paints a stored URL as an img. Both take `()`, the
// same factory shape as `diamond()`. `columnRenderer` stays on the Gantt column
// (D-S5-17).
export { meter, image } from '../layout/index.js';
// #264: a currency Field type is a factory, not a seeded name — `{ key: 'cost', type: currency({
// code: 'EUR' }) }`. Consumers name `percent` / `text` / `number` with the string; those stay off
// this barrel.
export { currency } from '../data/fields/field-types.js';

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
  isCoarserThan,
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
