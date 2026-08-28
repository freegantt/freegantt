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
// The first catchable errors (plans/02 §7, D-S1.8-9): FreeGanttError is the base every subclass
// extends, so a consumer can catch broadly or narrow on `.code`.
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

// model/ is the type surface api/ re-exports (plans/01 §1: "Only api/ and model/ types are public").
// The layer diagram doesn't draw the arrow because it's a type-only re-export, not a behavioral one —
// the same shape as api -> model in .dependency-cruiser.cjs / eslint.config.js. Without this, a
// consumer has no legal way to build the Entry[] that `new Dataset({ entries })` requires (#24).
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

// Same allow-list, extended to time/'s primitives: `instant` is what a caller needs to build a
// pinned `TimeSpan` for `range` or `TimeScaleModelOptions`. `presets` and `ViewPreset` are what a
// custom-preset author needs; the individually named preset constants and `resolvePreset` are not
// re-exported (issue #84) — resolving a `PresetRef` is core's own job, not a caller's. Re-exporting
// straight from time/ — rather than laundering through layout/ and view/'s barrels, which have no
// other interest in them — is the fix for #25. TimeScaleOptions stays internal: it carries the
// *resolved* geometry (zone, span, pxPerMs) the model derives from its bindings, not a caller's to
// state (#5).
export { presets, instant, formatDate, formatEndInclusive } from '../time/index.js';
export type { ViewPreset } from '../time/index.js';
