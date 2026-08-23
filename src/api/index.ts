export { Project } from './project.js';
export type { ProjectOptions } from './project.js';
export { Gantt } from './gantt.js';
export type { GanttOptions } from './gantt.js';
// TimeScaleModel/dayPreset/instant are deliberately public, not an accidental re-export: D9's shared
// viewport requires a consumer to construct a TimeScaleModel and pass the same instance to two Gantt
// instances to x-sync them (GanttOptions.scale), and dayPreset/instant are what TimeScaleOptions needs
// to build one. plans/02 §1's "nothing else" names the categories (model types, plugin contract, ...);
// these are the D9 viewport primitives that category implies, not scope creep.
export { TimeScaleModel, dayPreset, instant } from '../view/index.js';
export type { TimeScaleOptions, ViewPreset } from '../view/index.js';
