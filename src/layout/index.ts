export {
  computeFrame,
  placeFrame,
  resolveLayoutRows,
  barSpan,
  DEFAULT_TICK_BOX_FLOOR_PX,
  DEFAULT_MIN_BAR_WIDTH_PX,
  DEFAULT_BAR_HEIGHT_PX,
} from './frame.js';
export { pickDefined } from './pick-defined.js';
// `render/dom` never imports `model/` directly (render-boundary, plans/01 §1) — these two id
// helpers are pure id-string math with no model runtime behind them, re-exported here the same way
// `ColumnAlign` crosses this same boundary (#54).
export { itemId, itemIdFromDataset, rowIdFromDataset, entryIdOfItem, segmentId } from '../model/index.js';
export { wholeEntryItem, fixedWidthItem, ignoreSegments, followSegments } from './items/item.js';
export type { BarAnchor, FixedBarBox, Item, ItemProducer, VariantItems } from './items/item.js';
export { createVariantRegistry, bar, summary, diamond } from './items/variants.js';
// #265: shipped Grid-column cell renderers. DOM-free description trees, same factory
// shape as `diamond()` — `meterCell()`, `imageCell({ alt })`.
export { meterCell, imageCell } from './cells.js';
export type {
  DoubleVariantClaim,
  EntryVariant,
  FieldMatch,
  ReportDoubleClaim,
  ReportUnknownFieldMatch,
  ResolvedVariant,
  UnknownFieldMatch,
  VariantClaimant,
  VariantPredicate,
  VariantRegistry,
  VariantRegistryPorts,
  VariantRule,
} from './items/variants.js';
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
  CustomRowInput,
  RowFilter,
  RowSort,
  FilterPolicy,
  PlannedRowKind,
  ResolvedRowSource,
  ResolvedEntriesRowSource,
  ResolvedGroupRowSource,
} from './rows/row-source.js';
export { DEFAULT_ROW_SOURCE, isPlannedHeaderRow, nestsRows, resolveRowSource } from './rows/row-source.js';
export { FrameLayout } from './frame-layout.js';
export type { FrameLayoutView } from './frame-layout.js';
export { FrameMemory } from './frame-memory.js';
export { resolveDateLines, DEFAULT_DATE_LINE_LABEL_PLACEMENT } from './date-line.js';
export type {
  DateLine,
  DateLineDecoration,
  DateLineLabelPlacement,
  ResolveDateLinesInput,
} from './date-line.js';
export type {
  GeometryFrame,
  FrameRow,
  FrameBar,
  FrameLink,
  FrameDecoration,
  FrameHeader,
  FrameHeaderBand,
  FrameHeaderTick,
  FrameTickLine,
  Overscan,
  PathCommand,
  RangeBand,
  RowStripe,
  BarFlags,
  BarSpanKind,
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
export type {
  ItemId,
  RowId,
  EntryId,
  SegmentId,
  ClientPoint,
  ElementDescription,
  Entry,
} from '../model/index.js';
// S5.12, D-S5-40: `render/` may import `layout/` and nothing else (plans/01 §1), so the raise seam
// reaches `render/dom` the same way `ElementDescription` and `Entry` above already do — a backend
// that recovers from a throwing renderer must be able to report it.
export type { RaiseError, ErrorReportInput } from '../model/index.js';
// S5.4, D-S5-10/11/12: renderer callback vocabulary — the same "layout owns the paint-facing shape,
// render/dom reaches it through this one seam" pattern ElementDescription above already set.
export type {
  RendererPoint,
  BarRenderer,
  BarRendererContext,
  CellRenderer,
  CellRendererContext,
  HeaderRenderer,
  HeaderRendererContext,
  TooltipRenderer,
  TooltipRendererContext,
  RendererFor,
  ResolvedRenderer,
  BarLabels,
  BarLabelPlacement,
  ResolvedBarLabel,
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
  SnapSetting,
  Tick,
  HeaderFormat,
  DateFormat,
  PresetRef,
  ShippedPresetId,
} from '../time/index.js';
export { ZOOM_PRESETS, isTimeUnit } from '../time/index.js';
export { Viewport } from './viewport/viewport.js';
export type { ViewportOptions, ViewportHandle, DatasetBinding } from './viewport/viewport.js';
export { cursorLabelForX, draftForMove, draftForResize, previewOffsets } from './gesture-draft.js';
export type { DraftInput, ItemPreview, PreviewOffsetsInput } from './gesture-draft.js';
export type { SnapUnit } from '../time/index.js';
