# Interface: CommandContextOf\<TGantt, TDataset\>

Defined in: api/command.ts:126

`TDataset` defaults to the public, untyped `Dataset` the same way `TGantt` defaults to
 `unknown` — a plugin author binding their own `Dataset<TProps>` gets a typed
 `ctx.dataset` at every `when`/`run`; code with no reason to bind either type argument sees the
 exact surface it always has (#141 item #9).

## Type Parameters

### TGantt

`TGantt` = `unknown`

### TDataset

`TDataset` = [`Dataset`](../classes/Dataset.md)

## Properties

### dataset

> **dataset**: `TDataset`

Defined in: api/command.ts:128

The public Dataset. No privileged access, no second surface.

***

### entry?

> `optional` **entry?**: [`Entry`](Entry.md)\<`Record`\<`string`, `unknown`\>\>

Defined in: api/command.ts:135

The one Entry the invocation is *about*: the right-clicked bar, or the subject of the row the
 right-click landed in — the Entry whose Fields that row's cells show. A row that owns several
 names them all in `target.entryIds`; this stays the one. `undefined` when the invocation
 landed on no Entry at all.

***

### gantt

> **gantt**: `TGantt`

Defined in: api/command.ts:130

The public Gantt, for reading live config and calling public methods.

***

### target?

> `optional` **target?**: [`CommandTarget`](CommandTarget.md)

Defined in: api/command.ts:146

***

### variant?

> `optional` **variant?**: `string`

Defined in: api/command.ts:145

The variant this Gantt resolved for `entry` (ADR 0018). `undefined` when the invocation names
 no Entry at all.

 A command scoped to one variant reads it: `when: ({ variant }) => variant === MY_VARIANT`. That
 is the same answer the layout pass painted with, so a plugin never restates its own `when` rule
 here, and never keeps a list of the ids it owns.

 This is not `entry.variant` under another name. A variant is per Gantt, so a row cannot answer
 it (I2). A command context **is** one Gantt's, and it runs off the hot path.
