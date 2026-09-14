# Type Alias: ErrorReporter

> **ErrorReporter** = `"core"` \| `"consumer"` \| [`PluginId`](PluginId.md) & `object`

Defined in: model/error-report.ts:128

Who refused, or who broke. `'core'` is the library itself; `'consumer'` is the consumer's own
 code — a handler they registered on `beforeChange`/`before*`, or data they authored, as
 `'unknown-parent'` reports; a `PluginId` is the plugin that raised it.

 Named `by` because `origin` is taken (`ChangeOrigin`) and a bare `source` is barred (Field source,
 Row source). `PluginId` is a plain `string`, so it is intersected with `{}` here to keep the two
 literals in a reader's autocomplete — the same trick `ErrorCode` uses.
