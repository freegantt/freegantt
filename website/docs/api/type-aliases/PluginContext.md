# Type Alias: PluginContext\<TProps\>

> **PluginContext**\<`TProps`\> = [`PluginContextOf`](PluginContextOf.md)\<[`Gantt`](../classes/Gantt.md)\<`TProps`\>, [`Dataset`](../classes/Dataset.md)\<`TProps`\>\>

Defined in: api/gantt.ts:247

S5.1, D-S5-1, ADR 0019: the plugin shapes and `PluginContext`, bound to this class. See
 `api/plugin.ts`'s file header for why the generic forms live there and the binding happens here.
 This file is the one that sees both `Gantt` and `Dataset`. So all four names bind here, the
 Dataset-installed ones included. These are the types a plugin author actually writes, and
 `api/index.ts` re-exports them alongside the generic `*Of` shapes.

## Type Parameters

### TProps

`TProps` = `unknown`
