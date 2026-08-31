export { computeFrame, barSpan, DEFAULT_TICK_BOX_FLOOR_PX } from './frame.js';
export { paintColumns } from './column.js';
export type { FrameColumn, ResolvedColumn, FieldCompare } from './column.js';
export { FrameLayout } from './frame-layout.js';
export { resolveDateLines } from './date-line.js';
export type { DateLine, DateLineSpec, ResolveDateLinesInput } from './date-line.js';
export type {
  GeometryFrame,
  FrameRow,
  FrameBar,
  FrameLink,
  FrameDecoration,
  FrameHeader,
  FrameHeaderBand,
  FrameHeaderTick,
  Overscan,
  PathCommand,
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
export type {
  TimeScaleModelOptions,
  TimeScaleFit,
  ScaleBinding,
  ScaleBindingHandle,
} from './viewport/time-scale-model.js';
export { ScrollModel } from './viewport/scroll-model.js';
export type {
  ScrollPosition,
  ScrollState,
  ScrollBinding,
  ScrollBindingHandle,
} from './viewport/scroll-model.js';
export { PrefixSumHeightIndex } from './row-height-index.js';
export type { RowHeightIndex } from './row-height-index.js';
export type {
  TimeScale,
  ViewPreset,
  ViewPresetHeader,
  Tick,
  HeaderFormat,
  DateFormat,
  PresetRef,
  ShippedPresetId,
} from '../time/index.js';
export { ZOOM_PRESETS } from '../time/index.js';
export { Viewport } from './viewport/viewport.js';
export type { ViewportOptions, ViewportHandle, DatasetBinding } from './viewport/viewport.js';
export { cursorLabelForX, draftForMove, draftForResize, previewOffsets } from './gesture-draft.js';
export type { DraftInput, ItemPreview, PreviewOffsetsInput } from './gesture-draft.js';
export type { SnapUnit } from '../time/index.js';
