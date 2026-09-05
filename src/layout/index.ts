export {
  computeFrame,
  placeFrame,
  resolveLayoutRows,
  barSpan,
  DEFAULT_TICK_BOX_FLOOR_PX,
  DEFAULT_DIAMOND_SIZE_PX,
} from './frame.js';
export { DEFAULT_LANE_GAP_PX } from './lanes/pack-lanes.js';
export { pickDefined } from './pick-defined.js';
// `render/dom` never imports `model/` directly (render-boundary, plans/01 §1) — these two id
// helpers are pure id-string math with no model runtime behind them, re-exported here the same way
// `ColumnAlign` crosses this same boundary (#54).
export { itemId, itemIdFromDataset, entryIdOfItem } from '../model/index.js';
export { createItemProducerRegistry, wholeEntryItem } from './items/produce-items.js';
export type { Item, ItemProducer, ItemProducerRegistry } from './items/produce-items.js';
export { createRegistrationTable } from './registration-table.js';
export type { RegistrationTable } from './registration-table.js';
export type { FrameColumn, ResolvedColumn, FieldCompare, ColumnAlign } from './column.js';
export { gridContentWidth, totalColumnWidth } from './column.js';
export type {
  RowSource,
  EntriesRowSource,
  GroupRowSource,
  CustomRowSource,
  CustomRow,
  RowSourceCommon,
  RowHeightMode,
  CustomRowInput,
  RowFilter,
  RowSort,
  FilterPolicy,
  PlannedRowKind,
} from './rows/row-source.js';
export { DEFAULT_ROW_SOURCE, isPlannedHeaderRow } from './rows/row-source.js';
export { FrameLayout } from './frame-layout.js';
export { FrameMemory } from './frame-memory.js';
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
export { DecorationRunner } from './decorations.js';
export type { RegisteredDecorationProvider, DecorationsByLayer } from './decorations.js';
export type {
  DecorationLayer,
  DecorationContext,
  DecorationProvider,
  DecorationInput,
} from './decoration.js';
// Re-exported so render/ (layout-only import per plans/01 §1) can type item/row identity as
// ItemId/RowId rather than a bare string — render already receives both via GeometryFrame (#35).
// ElementDescription joins them the same way (S5.3, D-S5-10): render/dom/element-description.ts
// builds DOM from it and may not import model/ directly.
export type { ItemId, RowId, EntryId, ClientPoint, ElementDescription, Entry } from '../model/index.js';
// S5.4, D-S5-10/11/12: renderer callback vocabulary — the same "layout owns the paint-facing shape,
// render/dom reaches it through this one seam" pattern ElementDescription above already set.
export type {
  RendererPoint,
  BarRenderer,
  BarRendererContext,
  RendererByKind,
  CellRenderer,
  CellRendererContext,
  HeaderRenderer,
  HeaderRendererContext,
  TooltipRenderer,
  TooltipRendererContext,
  RendererFor,
  ResolvedRenderer,
} from './renderer.js';
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
