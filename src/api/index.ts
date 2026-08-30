export { Dataset } from './dataset.js';
export type { DatasetOptions } from './dataset.js';
export type {
  ChangeSet,
  ChangeSetId,
  ChangeOrigin,
  StoreName,
  CoreFieldKey,
  FieldKey,
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
  NavigationChange,
} from '../view/index.js';
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
  UnknownFieldError,
  MutationDuringNotificationError,
  MutationCancelledError,
  InvalidReplayOriginError,
  UnsupportedSchemaError,
} from '../model/index.js';

// model/ types the public surface re-exports. A consumer building entries or catching errors names these.
export { entryId, itemId, changeSetId } from '../model/index.js';
export type {
  Entry,
  EntryKind,
  EntryId,
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
export type { DatasetDocument, EntryDocument } from '../model/index.js';
// Point/Size are the S1.5 ScrollModel's own vocabulary (S1.5 README §5) — a consumer building
// `new ScrollModel({ x, y })` or reading `ScrollState` needs the shape in the public surface too.
export type { Point, Size } from '../model/index.js';

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
export type { ViewPreset, ViewPresetHeader, TickStep, DateFormat, HeaderFormat } from '../time/index.js';
