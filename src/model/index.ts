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
export type { Instant, TimeUnit, TimeSpan, Duration, PlainParts } from './time.js';
export type { InstantInput, TimeSpanInput, PlainTimeInput } from './time.js';
export type { Entry } from './entry.js';
export type { TreePlace } from './tree-place.js';
export type {
  StoredEntry,
  EntryInput,
  FlatEntryInput,
  EntryIngestInput,
  EntryDelta,
  EntryEdit,
  PropsEdit,
  ProposedEdit,
  ProposedEdits,
  EntryEdits,
} from './stored-entry.js';
export type {
  EditRequest,
  EditExtender,
  ExtenderWrapper,
  RemovalExtender,
  RemovalExtenderWrapper,
} from './edit-request.js';
// The span invariant's one home (ADR 0012). A value export, and the only one `model/` holds outside
// ids.ts and errors.ts — see `spansTime`'s own comment for why the carve-out admits it.
export { spansTime } from './stored-entry.js';
export type { HierarchySource, HierarchySourceWrapper } from './hierarchy-source.js';
export type { FieldLockQuery, FieldLockRule, FieldLockRuleWrapper } from './field-lock.js';
export type { PlaceQuery, PlaceRule, PlaceRuleWrapper } from './place-rule.js';
export type { RemoveQuery, RemoveRule, RemoveRuleWrapper } from './remove-rule.js';
export type { Point, Size, PixelSpan, Rect, ClientPoint } from './geometry.js';
export type { ElementDescription } from './render.js';
export type { Dataset, EntryStore, EntryStoreView } from './dataset.js';
export type { PluginId, Disposer, PluginStore, PluginStoreView } from './plugin.js';
export type { KeyChord, TargetKind } from './command.js';
export type { WriteVerdict, WriteRefusalReason, WriteTarget } from './write-verdict.js';
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
  ReplayOptions,
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
export type { InvalidInstantReason } from './errors.js';
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
  SiblingIndexOutOfRangeError,
  UnknownFieldError,
  UnknownGridColumnError,
  DuplicateFieldKeyError,
  ReservedFieldKeyError,
  DuplicatePropsKeyError,
  IllegalCoreFieldOverrideError,
  ComputedFieldCannotBeWrittenError,
  FieldNotEditableError,
  PlaceRefusedError,
  RemoveRefusedError,
  DerivedFieldNotWritableError,
  UnknownAggregatorError,
  UnknownFieldTypeError,
  FieldColumnNotDefinedError,
  DuplicateRowIdError,
  AggregatorFailedError,
  MutationDuringNotificationError,
  MutationDuringExtensionHookError,
  TransactionAlreadyOpenError,
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
  CustomRowSourceNotFilterableOrSortableError,
} from './errors.js';
// S5.12: the Error report the `error` event carries on both buses, plus the raise seam
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
