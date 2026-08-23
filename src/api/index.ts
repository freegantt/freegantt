export { Project } from './project.js';
export type { ProjectOptions } from './project.js';
export { Gantt } from './gantt.js';
export type { GanttOptions } from './gantt.js';
// TimeScaleModel/dayPreset/instant are deliberately public, not an accidental re-export: D9's shared
// viewport requires a consumer to construct a TimeScaleModel and pass the same instance to two Gantt
// instances to x-sync them (GanttOptions.scale), and dayPreset/instant are what TimeScaleIntent needs
// to build one (a preset, and instants for a pinned range). plans/02 §1's "nothing else" names the
// categories (model types, plugin contract, ...); these are the D9 viewport primitives that category
// implies, not scope creep. TimeScaleOptions stays internal — it carries the *resolved* geometry
// (zone, span, pxPerMs) the model derives from its bindings, which is not a caller's to state (#5).
export { TimeScaleModel, dayPreset, instant } from '../view/index.js';
export type { TimeScaleIntent, ViewPreset } from '../view/index.js';
