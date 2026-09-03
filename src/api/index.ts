export { Dataset } from './dataset.js';
export type { DatasetOptions, DatasetHierarchy } from './dataset.js';
export type { RollUpKinds } from '../model/index.js';
export { attemptMutation } from './attempt-mutation.js';
export type {
  ChangeSet,
  ChangeSetId,
  ChangeOrigin,
  StoreName,
  CoreFieldKey,
  FieldKey,
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
export { invertChangeSet } from '../data/change-set.js';
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
export type { Theme, ViewportGestures, ViewportGestureFlags } from '../view/index.js';
export type {
  GanttEventMap,
  GanttEventHandler,
  GanttEvents,
  AsyncCancelableEvent,
  GridWidthChange,
  NavigationChange,
  SelectionChange,
  CollapseChange,
  ProposedSpan,
  EntryGestureEvent,
  EntryMove,
  EntryResize,
} from '../view/index.js';
// S3, D-S3-9: `Gantt.interactions`'s own type and the per-gesture rule shape (`view/capability.ts`).
export type { CapabilityRule, Interactions } from '../view/index.js';
// S5.3, D-S5-8: `PluginContext.view.overlay`'s own type — a plugin builds a `Popup` (or its own
// primitive) against this alone, never against `view/` or `render/` directly.
export type { Overlay, OverlayHandle } from '../view/index.js';
// S5.3, D-S5-8: the anchoring/flipping/clamping/dismissal primitive tooltips, the context menu and
// the cell editor (S5.5+) all build on — built from `Overlay` alone, so a plugin author reaches the
// same thing by calling `createPopup(ctx.view.overlay)` rather than reinventing it.
export { createPopup } from '../extensions/popup.js';
export type { Popup, PopupOptions, PopupPlacement, DismissTrigger, Anchor } from '../extensions/popup.js';
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
  RegistrationClosedError,
  PluginSetupError,
  UnknownCommandError,
} from '../model/index.js';

// model/ types the public surface re-exports. A consumer building entries or catching errors names these.
export { entryId, itemId, entryIdOfItem, segmentIndexOfItem, changeSetId } from '../model/index.js';
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
export type { DatasetDocument, EntryDocument, SerializedField } from '../model/index.js';
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
export type { ElementDescription } from '../model/index.js';

// Time helpers a caller needs: `instant` for a pinned `TimeSpan`, `now` for "this Instant",
// `addMs`/`MS` to shift one by a duration (S2.7 harness-review — `harness/data.ts`'s move-by-a-day
// buttons had no public way to do this and were hand-rolling `entry.start + 86400000`; the Add-entry
// button then used `instant(Date.now())` the same way). Named preset constants and `resolvePreset`
// stay internal — resolving a `PresetRef` is core's job.
export {
  presets,
  instant,
  now,
  addMs,
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
