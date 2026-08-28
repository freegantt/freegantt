export { Dataset } from './dataset.js';
export type { DatasetOptions } from './dataset.js';
export type {
  ChangeSet,
  ChangeSetId,
  ChangeOrigin,
  StoreName,
  FieldKey,
  EntityAdded,
  EntityRemoved,
  FieldUpdated,
  EntryEdit,
  DatasetEventMap,
} from '../model/index.js';
export { Gantt } from './gantt.js';
export type { GanttOptions } from './gantt.js';
export type { Theme } from '../view/index.js';
export { TimeScaleModel, ScrollModel } from '../view/index.js';
export type {
  TimeScaleModelOptions,
  TimeScaleFit,
  PresetRef,
  ShippedPresetId,
  ScrollPosition,
  ScrollState,
  GanttEventMap,
  GridWidthChange,
} from '../view/index.js';
// Catchable errors (plans/02 §7): FreeGanttError is the base; a consumer can catch broadly or on `.code`.
export {
  FreeGanttError,
  UnsupportedUnitError,
  ContainerNotFoundError,
  InvalidInstantError,
  UnknownPresetError,
  EntryNotFoundError,
  DuplicateEntryIdError,
  ParentCycleError,
  UnknownFieldError,
  MutationDuringNotificationError,
  MutationCancelledError,
} from '../model/index.js';

// model/ types the public surface re-exports. A consumer building entries or catching errors names these.
export { entryId, itemId } from '../model/index.js';
export type {
  Entry,
  EntryKind,
  EntryId,
  ItemId,
  Instant,
  TimeSpan,
  Duration,
  EntryStoreView,
  EntryStore,
} from '../model/index.js';
// The input twins of the stored types: what a consumer writes, as opposed to what the library stores.
// Public because a consumer that types its own entry builder needs to name them.
export type { EntryInput, InstantInput, TimeSpanInput, DateOnlyEndRule } from '../model/index.js';
// Point/Size are the S1.5 ScrollModel's own vocabulary (S1.5 README §5) — a consumer building
// `new ScrollModel({ x, y })` or reading `ScrollState` needs the shape in the public surface too.
export type { Point, Size } from '../model/index.js';

// Time helpers a caller needs: `instant` for a pinned `TimeSpan`, `presets`/`ViewPreset` for a custom
// axis. Named preset constants and `resolvePreset` stay internal — resolving a `PresetRef` is core's job.
export { presets, instant, formatDate, formatEndInclusive } from '../time/index.js';
export type { ViewPreset } from '../time/index.js';
