export type { EntryId, RowId, BarId, ChangeSetId } from './ids.js';
export {
  entryId,
  rowId,
  barId,
  barIdFromDataset,
  rowIdFromDataset,
  entryIdFromDataset,
  entryIdOfBar,
  partIndexOfBar,
  changeSetId,
} from './ids.js';
export type { Instant, TimeUnit, TimeSpan, Duration, DurationMeasure, PlainParts } from './time.js';
export type { InstantInput, TimeSpanInput, DateOnlyEndRule, PlainTimeInput } from './time.js';
export type { Entry } from './entry.js';
export type {
  StoredEntry,
  EntryInput,
  EntryEdit,
  PropsEdit,
  ProposedEdit,
  ProposedEdits,
  EntryEdits,
  EditRequest,
  EditExtender,
} from './stored-entry.js';
// The span invariant's one home (ADR 0012). A value export, and the only one `model/` holds outside
// ids.ts and errors.ts — see `spansTime`'s own comment for why the carve-out admits it.
export { spansTime } from './stored-entry.js';
export type { HierarchySource, HierarchySourceWrapper } from './hierarchy-source.js';
export type { Point, Size, PixelSpan, Rect, ClientPoint } from './geometry.js';
export type { ElementDescription } from './render.js';
export type { Dataset, EntryStore, EntryStoreView } from './dataset.js';
export type { PluginId, Disposer, ExtenderWrapper, PluginStore, PluginStoreView } from './plugin.js';
export type { KeyChord, TargetKind } from './command.js';
export type { WriteVerdict, WriteRefusalReason } from './write-verdict.js';
// ADR 0018: one vocabulary for the consumer's own `capabilities` and a variant's own `capabilities`.
export type { CapabilityRule, WriteRule, GestureCapability, Capabilities } from './capabilities.js';
export type {
  StoreName,
  PluginStoreName,
  ChangeOrigin,
  EntityAdded,
  EntityRemoved,
  FieldUpdated,
  StoreRowUpdated,
  UpdatedRow,
  ChangeSet,
  DatasetEventMap,
} from './change-set.js';
export type {
  CoreFieldKey,
  CoreFieldValues,
  CoreFieldValue,
  FieldKey,
  FieldValue,
  AggregatorName,
  FieldTypeName,
  Field,
  FieldEditable,
  FieldType,
  FieldLookup,
  ComputeContext,
  FieldContext,
  FormatContext,
  RollUpContext,
  Aggregator,
  FieldDistributor,
  GridColumn,
  GridColumnInput,
  GridColumnBase,
  GridColumnSizing,
  ColumnRenderer,
  ColumnAlign,
  ColumnRendererContext,
  TooltipColumn,
} from './field.js';
export type { BuiltInThrownCode, ThrownCode } from './errors.js';
export {
  FreeGanttError,
  UnsupportedUnitError,
  InvalidSnapIncrementError,
  ContainerNotFoundError,
  InvalidInstantError,
  InvalidPlainTimeError,
  UnknownPresetError,
  InvalidPresetError,
  EntryNotFoundError,
  RevealTargetNotFoundError,
  DuplicateEntryIdError,
  ParentCycleError,
  InvertedSpanError,
  UnknownFieldError,
  UnknownGridColumnError,
  DuplicateFieldKeyError,
  ReservedFieldKeyError,
  DuplicatePropsKeyError,
  IllegalCoreFieldOverrideError,
  ComputedFieldCannotBeWrittenError,
  FieldNotEditableError,
  DerivedFieldNotWritableError,
  UnknownAggregatorError,
  UnknownFieldTypeError,
  FieldColumnNotDefinedError,
  DuplicateRowIdError,
  AggregatorFailedError,
  MutationDuringNotificationError,
  MutationDuringExtensionHookError,
  MutationCancelledError,
  UnreadableCellValueError,
  InvalidReplayOriginError,
  DuplicatePluginIdError,
  PluginNotInstalledError,
  MissingPluginError,
  PluginRequirementCycleError,
  RegistrationClosedError,
  PluginSetupError,
  UnknownCommandError,
  RendererAlreadyRegisteredError,
  EmptyCoversError,
} from './errors.js';
// S5.12, D-S5-40: the Error report the `error` event carries on both buses, plus the raise seam
// every layer that has no bus of its own is handed.
export type {
  ErrorReport,
  ErrorReportInput,
  BuiltInReportCode,
  ReportCode,
  ErrorSeverity,
  ErrorReporter,
  GestureDroppedReason,
  Refusable,
  RaiseError,
  PluginErrorReport,
} from './error-report.js';
