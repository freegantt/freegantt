export { computeFrame } from './frame.js';
export type {
  GeometryFrame,
  FrameRow,
  FrameBar,
  FrameLink,
  FrameDecoration,
  FrameHeader,
  FrameHeaderTick,
  PathCommand,
  TodayLine,
  RangeBand,
  RowStripe,
  BarFlags,
  LinkFlags,
  LayoutInput,
} from './frame.js';
// Re-exported so render/ (layout-only import per plans/01 §1) can type item/row identity as
// ItemId/RowId rather than a bare string — render already receives both via GeometryFrame (#35).
export type { ItemId, RowId } from '../model/index.js';
export { TimeScaleModel } from './viewport/time-scale-model.js';
export type { TimeScaleIntent, ScaleBinding, ScaleBindingHandle } from './viewport/time-scale-model.js';
export { ScrollModel } from './viewport/scroll-model.js';
export type {
  ScrollIntent,
  ScrollPosition,
  ScrollState,
  ScrollBinding,
  ScrollBindingHandle,
} from './viewport/scroll-model.js';
export { PrefixSumHeightIndex } from './row-height-index.js';
export type { RowHeightIndex } from './row-height-index.js';
export type { TimeScale, ViewPreset, ViewPresetHeader, Tick, HeaderFormat } from '../time/index.js';
