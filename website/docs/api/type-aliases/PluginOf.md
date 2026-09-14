# Type Alias: PluginOf\<TViewContext, TDataset\>

> **PluginOf**\<`TViewContext`, `TDataset`\> = [`ChromePluginOf`](../interfaces/ChromePluginOf.md)\<`TViewContext`\> \| [`DataPluginOf`](../interfaces/DataPluginOf.md)\<`TViewContext`, `TDataset`\>

Defined in: api/plugin.ts:63

One installed plugin, either arm. `DatasetOptions.plugins` takes this; `GanttOptions.plugins`
 takes `ChromePluginOf` alone.

## Type Parameters

### TViewContext

`TViewContext` = `unknown`

### TDataset

`TDataset` = `unknown`
