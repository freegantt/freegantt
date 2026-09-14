# Type Alias: PluginErrorReport

> **PluginErrorReport** = `Omit`\<[`ErrorReportInput`](ErrorReportInput.md), `"by"`\>

Defined in: model/error-report.ts:180

What a plugin raises through `PluginContext.raiseError` (S5.12, D-S5-40). Core fills `by` with
 that plugin's own id, so `by` is a fact the runtime knows and never a claim a plugin makes about
 itself — the same "core fills what core knows" split `plans/02` already draws. No `fallback`
 either: the fallback exists to preserve a `console` line core printed before this seam, and a
 plugin has none to preserve.
