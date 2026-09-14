# Interface: ChromePluginOf\<TViewContext\>

Defined in: api/plugin.ts:41

A plugin that is chrome and nothing else — `weekendShading()`. It declares no Field, reserves no
 store and claims no edit hook. So it installs on the `Gantt`, and `gantt.plugins` reconfigures it
 live.

 `data?: never` makes the wrong install site unrepresentable. `GanttOptions.plugins` takes this arm
 alone. So a plugin with a `data` half is a red squiggle in the editor, never a runtime discovery.
 It is the rule that keeps a shared `scale` off a `Gantt` that names `preset`.

## Extends

- [`PluginIdentity`](PluginIdentity.md)

## Type Parameters

### TViewContext

`TViewContext` = `unknown`

## Properties

### data?

> `optional` **data?**: `undefined`

Defined in: api/plugin.ts:46

***

### id

> **id**: `string`

Defined in: api/plugin.ts:26

#### Inherited from

[`PluginIdentity`](PluginIdentity.md).[`id`](PluginIdentity.md#id)

***

### requires?

> `optional` **requires?**: readonly `string`[]

Defined in: api/plugin.ts:31

Plugin ids that must also be installed. Does not imply an order in the array: installation
 resolves setup order from `requires` alone, so `[a, b]` and `[b, a]` install identically
 (D-S5-31). A required id nobody installs throws `MissingPluginError`. One list covers both
 halves (ADR 0019).

#### Inherited from

[`PluginIdentity`](PluginIdentity.md).[`requires`](PluginIdentity.md#requires)

## Methods

### view()

> **view**(`ctx`): `void` \| [`Disposer`](../type-aliases/Disposer.md)

Defined in: api/plugin.ts:45

Variants, renderers, decorations, commands and keys. Runs once, as a Gantt mounts. It returns a
 `Disposer` for the plugin's own resources, or nothing at all (review P4). Every `register*` and
 every `onDomEvent` files its own removal in `ctx.disposables`.

#### Parameters

##### ctx

`TViewContext`

#### Returns

`void` \| [`Disposer`](../type-aliases/Disposer.md)
