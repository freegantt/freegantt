# Function: definePlugin()

## Call Signature

> **definePlugin**\<`TProps`, `TPlugin`\>(`plugin`): `TPlugin`

Defined in: api/define-plugin.ts:42

Call: `definePlugin({ id: 'acme.locks', data(ctx) { … }, view(ctx) { … } })`.

It returns the object it is given. What it adds is the type: it reads which halves the object
fills and narrows to that arm, so a plugin with a `data` half is a red squiggle the moment it
reaches `GanttOptions.plugins` — in the editor, not at mount.

**One plugin, two halves, one install site.** `data(ctx)` declares Fields, claims the edit hook and
reserves the store; it is DOM-free and runs as the `Dataset` constructs. `view(ctx)` registers
variants, renderers, commands and keys, and runs as a `Gantt` mounts. A plugin with a `data` half
installs on the `Dataset`, because a Field must exist before the first Rollup (D-S5-4). Every Gantt
bound to that Dataset then runs `view` once, each with its own context, so I2 holds by
construction. A chrome-only plugin installs on the `Gantt`.

```ts
const scheduling = () =>
  definePlugin({
    id: 'freegantt.scheduling',
    requires: ['freegantt.calendar'],
    data(ctx) { … },
    view(ctx) { … },
  });

const dataset = new Dataset({ entries, plugins: [scheduling()] });
const gantt = new Gantt({ dataset }); // its Fields, variants, bars and menu are already there
```

Wrap the call in a factory, as above. One factory call is one install's worth of state, which is
what keeps two Gantts on one page independent (I2).

Pass `TProps` — `definePlugin<TaskProps>({ … })` — to read the consumer's declared Field keys off
`ctx.dataset` and `ctx.gantt`. Leave it off and the plugin is written against an untyped Dataset,
which is what a plugin published for any consumer wants. Naming it fixes the return type to the
arm; leaving it off keeps whatever extra members the object declares, so a plugin that publishes
its own calls beside `id` (#178) keeps them.

### Type Parameters

#### TProps

`TProps` = `unknown`

#### TPlugin

`TPlugin` *extends* [`ChromePlugin`](../type-aliases/ChromePlugin.md)\<`TProps`\> = [`ChromePlugin`](../type-aliases/ChromePlugin.md)\<`TProps`\>

### Parameters

#### plugin

`TPlugin`

### Returns

`TPlugin`

## Call Signature

> **definePlugin**\<`TProps`, `TPlugin`\>(`plugin`): `TPlugin`

Defined in: api/define-plugin.ts:54

The arm a plugin with a `data` half resolves to — see the first signature above for the whole
contract, the example and `TProps`.

This arm installs on the **Dataset**: `new Dataset({ entries, plugins: [acmeLocks()] })`. A Field
must exist before the first Rollup walks (D-S5-4), so `GanttOptions.plugins` refuses it, in the
editor rather than at mount. It may fill `view` as well, and every Gantt bound to that Dataset
then runs `view` once with its own context.

### Type Parameters

#### TProps

`TProps` = `unknown`

#### TPlugin

`TPlugin` *extends* [`DataPlugin`](../type-aliases/DataPlugin.md)\<`TProps`\> = [`DataPlugin`](../type-aliases/DataPlugin.md)\<`TProps`\>

### Parameters

#### plugin

`TPlugin`

### Returns

`TPlugin`
