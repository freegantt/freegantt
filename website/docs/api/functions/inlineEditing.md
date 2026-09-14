# Function: inlineEditing()

> **inlineEditing**(`options?`): [`ChromePlugin`](../type-aliases/ChromePlugin.md)

Defined in: extensions/features/inline-editing.ts:631

D-S5-19/D-S5-20: a cost cell edits in place, in one transaction, and a consumer replaces the whole
 editor through `beforeEntryEdit` (`[S5-A5]`). Call: `new Gantt({ plugins: [inlineEditing()] })`.

## Parameters

### options?

[`InlineEditingOptions`](../interfaces/InlineEditingOptions.md) = `{}`

## Returns

[`ChromePlugin`](../type-aliases/ChromePlugin.md)
