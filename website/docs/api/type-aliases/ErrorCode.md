# Type Alias: ErrorCode

> **ErrorCode** = [`BuiltInErrorCode`](BuiltInErrorCode.md) \| `string` & `object`

Defined in: model/error-report.ts:95

The machine-readable half of an Error report — kebab-case, and open at the tail so a plugin can
 mint its own (which `ErrorReport.by`'s `PluginId` case requires). The shipped codes autocomplete;
 the `(string & {})` tail is the same shape a `FieldKey` already uses.

 Two of these codes also name a thrown `FreeGanttError` — `'mutation-cancelled'` and
 `'unreadable-value'` — and each one matches that class's own `code`. This match is a convention
 the two files keep by hand. Nothing checks it (#259), because `model/errors.ts` writes its codes
 as literals in `super(…)` calls. Read the class before you assume a third code matches.
