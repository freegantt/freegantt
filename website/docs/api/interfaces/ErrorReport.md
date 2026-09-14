# Interface: ErrorReport

Defined in: model/error-report.ts:136

What the `error` event carries, on the Dataset and on the Gantt alike (D-S5-40).

 Flat fields plus `cause`, not a wrapped error: every report renders and serializes with no type
 test, and nothing is lost — `cause` carries `MutationCancelledError.changeSet`,
 `PluginSetupError.pluginId`, and the chain. Not every raise site has an error object (a silent
 gesture veto has none), which is why `code`/`message` are the required pair.

## Properties

### at

> `readonly` **at**: [`Instant`](../type-aliases/Instant.md)

Defined in: model/error-report.ts:139

When core observed it — `time/`'s `now()`, stamped by the raiser so no other layer reads a
 clock (I10).

***

### by

> `readonly` **by**: [`ErrorReporter`](../type-aliases/ErrorReporter.md)

Defined in: model/error-report.ts:144

***

### cause?

> `readonly` `optional` **cause?**: `unknown`

Defined in: model/error-report.ts:155

The `FreeGanttError` or thrown value behind it, when one exists.

***

### code

> `readonly` **code**: [`ErrorCode`](../type-aliases/ErrorCode.md)

Defined in: model/error-report.ts:140

***

### entryId?

> `readonly` `optional` **entryId?**: [`EntryId`](../type-aliases/EntryId.md)

Defined in: model/error-report.ts:151

The entry the report is about, when it is about one.

***

### field?

> `readonly` `optional` **field?**: [`FieldKey`](../type-aliases/FieldKey.md)

Defined in: model/error-report.ts:153

The Field key the report is about, when it is about one.

***

### message

> `readonly` **message**: `string`

Defined in: model/error-report.ts:142

One sentence, for a person. The console fallback prints exactly this.

***

### reason?

> `readonly` `optional` **reason?**: `string`

Defined in: model/error-report.ts:149

Why the refusal happened, in the words of whoever refused — a `before*` handler's own sentence,
 verbatim (#210). Present only when a handler called `refuse(reason)`; a bare `false` leaves it
 `undefined`. `message` quotes it too, so a console fallback prints it; this member is here so a
 consumer can show their own words without core's framing around them.

***

### severity

> `readonly` **severity**: [`ErrorSeverity`](../type-aliases/ErrorSeverity.md)

Defined in: model/error-report.ts:143
