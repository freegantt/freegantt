// view/ — chart shell, grid pane, timeline pane, viewport binding (plans/01 §8.2-8.3). Touches the DOM.
// Full grid/timeline/viewport split lands in S1. No view code reads/writes scroll except through the
// bound ScrollModel (I12).
export { Chart } from './chart.js';
export type { ChartOptions } from './chart.js';
export { TimeScaleModel, dayPreset, instant } from '../layout/index.js';
export type { TimeScaleIntent, ViewPreset } from '../layout/index.js';
