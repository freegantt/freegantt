export { Dataset } from './dataset.js';
export type { DatasetOptions } from './dataset.js';
export { Gantt } from './gantt.js';
export type { GanttOptions } from './gantt.js';
export { TimeScaleModel, ScrollModel } from '../view/index.js';
export type {
  TimeScaleIntent,
  TimeScaleZoom,
  PresetRef,
  ShippedPresetId,
  Overscan,
  ScrollIntent,
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
  HostNotFoundError,
  InvalidInstantError,
  UnknownPresetError,
  EntryNotFoundError,
} from '../model/index.js';

// model/ is the type surface api/ re-exports (plans/01 §1: "Only api/ and model/ types are public").
// The layer diagram doesn't draw the arrow because it's a type-only re-export, not a behavioral one —
// the same shape as api -> model in .dependency-cruiser.cjs / eslint.config.js. Without this, a
// consumer has no legal way to build the Entry[] that `new Dataset({ entries })` requires (#24).
export { entryId, itemId } from '../model/index.js';
export type { Entry, EntryKind, EntryId, ItemId, Instant, TimeSpan, Duration } from '../model/index.js';
// The input twins of the stored types: what a host writes, as opposed to what the library stores.
// Public because a host that types its own entry builder needs to name them.
export type { EntryInput, InstantInput, TimeSpanInput, DateOnlyEndRule } from '../model/index.js';
// Point/Size are the S1.5 ScrollModel's own vocabulary (S1.5 README §5) — a consumer building
// `ScrollIntent.position` or reading `ScrollState` needs the shape in the public surface too.
export type { Point, Size } from '../model/index.js';

// Same allow-list, extended to time/'s primitives and presets: dayPreset/instant are what
// TimeScaleIntent needs to build a shared viewport (D9's x-sync requires a consumer to construct one
// TimeScaleModel and pass it to two Gantt instances via GanttOptions.scale). Re-exporting them
// straight from time/ — rather than laundering them through layout/ and view/'s barrels, which have
// no other interest in them — is the fix for #25. TimeScaleOptions stays internal: it carries the
// *resolved* geometry (zone, span, pxPerMs) the model derives from its bindings, not a caller's to
// state (#5).
export {
  dayPreset,
  hourPreset,
  weekPreset,
  monthPreset,
  yearPreset,
  dayAndWeekPreset,
  weekAndMonthPreset,
  monthAndYearPreset,
  presets,
  resolvePreset,
  instant,
} from '../time/index.js';
export type { ViewPreset } from '../time/index.js';
