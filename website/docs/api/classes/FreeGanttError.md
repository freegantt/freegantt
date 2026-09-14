# Class: FreeGanttError

Defined in: model/errors.ts:30

## Extends

- `Error`

## Extended by

- [`UnsupportedUnitError`](UnsupportedUnitError.md)
- [`InvalidSnapIncrementError`](InvalidSnapIncrementError.md)
- [`ContainerNotFoundError`](ContainerNotFoundError.md)
- [`InvalidInstantError`](InvalidInstantError.md)
- [`UnknownPresetError`](UnknownPresetError.md)
- [`InvalidPresetError`](InvalidPresetError.md)
- [`EntryNotFoundError`](EntryNotFoundError.md)
- [`SegmentNotFoundError`](SegmentNotFoundError.md)
- [`RevealTargetNotFoundError`](RevealTargetNotFoundError.md)
- [`DuplicateEntryIdError`](DuplicateEntryIdError.md)
- [`DuplicateSegmentIdError`](DuplicateSegmentIdError.md)
- [`ParentCycleError`](ParentCycleError.md)
- [`SegmentsOutOfSyncError`](SegmentsOutOfSyncError.md)
- [`EmptySegmentsError`](EmptySegmentsError.md)
- [`InvertedSpanError`](InvertedSpanError.md)
- [`UnknownFieldError`](UnknownFieldError.md)
- [`UnknownGridColumnError`](UnknownGridColumnError.md)
- [`DuplicateFieldKeyError`](DuplicateFieldKeyError.md)
- [`DuplicatePropsKeyError`](DuplicatePropsKeyError.md)
- [`ReservedFieldKeyError`](ReservedFieldKeyError.md)
- [`IllegalCoreFieldOverrideError`](IllegalCoreFieldOverrideError.md)
- [`ComputedFieldCannotBeWrittenError`](ComputedFieldCannotBeWrittenError.md)
- [`FieldNotEditableError`](FieldNotEditableError.md)
- [`DerivedFieldNotWritableError`](DerivedFieldNotWritableError.md)
- [`UnknownAggregatorError`](UnknownAggregatorError.md)
- [`AggregatorFailedError`](AggregatorFailedError.md)
- [`UnknownFieldTypeError`](UnknownFieldTypeError.md)
- [`FieldNotColumnableError`](FieldNotColumnableError.md)
- [`DuplicateRowIdError`](DuplicateRowIdError.md)
- [`MutationDuringNotificationError`](MutationDuringNotificationError.md)
- [`MutationDuringExtensionHookError`](MutationDuringExtensionHookError.md)
- [`MutationCancelledError`](MutationCancelledError.md)
- [`UnreadableCellValueError`](UnreadableCellValueError.md)
- [`InvalidReplayOriginError`](InvalidReplayOriginError.md)
- [`DuplicatePluginIdError`](DuplicatePluginIdError.md)
- [`PluginNotInstalledError`](PluginNotInstalledError.md)
- [`MissingPluginError`](MissingPluginError.md)
- [`PluginRequirementCycleError`](PluginRequirementCycleError.md)
- [`RegistrationClosedError`](RegistrationClosedError.md)
- [`PluginSetupError`](PluginSetupError.md)
- [`UnknownCommandError`](UnknownCommandError.md)
- [`RendererAlreadyRegisteredError`](RendererAlreadyRegisteredError.md)

## Constructors

### Constructor

> **new FreeGanttError**(`code`, `message`, `options?`): `FreeGanttError`

Defined in: model/errors.ts:33

#### Parameters

##### code

`string`

##### message

`string`

##### options?

`ErrorOptions`

#### Returns

`FreeGanttError`

#### Overrides

`Error.constructor`

## Properties

### code

> `readonly` **code**: `string`

Defined in: model/errors.ts:31
