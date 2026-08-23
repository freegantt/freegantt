export { computeFrame } from './frame.js';
export type { GeometryFrame, FrameRow, FrameBar, BarFlags, LinkFlags, LayoutInput } from './frame.js';
// Re-exported so render/ (layout-only import per plans/01 §1) can type item identity as ItemId
// rather than a bare string — render already receives ItemId via GeometryFrame.FrameBar.id.
export type { ItemId } from '../model/index.js';
export { TimeScaleModel } from './time-scale-model.js';
export { dayPreset, instant } from '../time/index.js';
export type {
  TimeScale,
  TimeScaleOptions,
  ViewPreset,
  ViewPresetHeader,
  Tick,
  HeaderFormat,
} from '../time/index.js';
