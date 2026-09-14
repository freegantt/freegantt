# Type Alias: PluginContextOf\<TGantt, TDataset\>

> **PluginContextOf**\<`TGantt`, `TDataset`\> = [`PluginContextParts`](../interfaces/PluginContextParts.md)\<`TGantt`, `TDataset`\> & `object`

Defined in: api/plugin-context.ts:69

What a plugin's `view()` half receives, once, after the Gantt mounts.

 #166: `PluginContextParts` (`view/plugin-ports.ts`) is the one member list, and carries the doc
 for every member. This adds the two api-level members `view/` may not name, and nothing else.
 A new plugin capability is one edit there, and it reaches a plugin author with no edit here.
 Before this, both lists were typed by hand and nothing checked that they matched.

 #191: the two members that bind `TGantt`/`TDataset` — `commands` and
 `interaction.registerKeybinding` — now take those type arguments where they are declared. So this
 is an intersection and no longer an `Omit` of a surface that published the unbound forms.

 Both type arguments default to `unknown`, the way `PluginContextParts`'s own already do. A plugin
 author binds them through the `PluginContext` alias `api/gantt.ts` publishes, and a typed
 `ctx.dataset`/`ctx.gantt` comes with it (#141 item #9).

## Type Declaration

### dataset

> **dataset**: `TDataset`

The public Dataset. No privileged access, no second surface.

### gantt

> **gantt**: `TGantt`

The public Gantt, for reading live config and calling public methods.

## Type Parameters

### TGantt

`TGantt` = `unknown`

### TDataset

`TDataset` = `unknown`
