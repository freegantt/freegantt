# Interface: CommandRegistryOf\<TGantt, TDataset\>

Defined in: api/command.ts:164

D-S5-6: register once, run by id, list what a `CommandContext` currently allows. `run` throws
 `UnknownCommandError` for an id nothing owns; a registered command whose `when` declines is a
 silent no-op, the same posture `available`'s own filter takes.

## Type Parameters

### TGantt

`TGantt` = `unknown`

### TDataset

`TDataset` = [`Dataset`](../classes/Dataset.md)

## Methods

### available()

> **available**(`ctx?`): readonly [`CommandOf`](CommandOf.md)\<`TGantt`, `TDataset`\>[]

Defined in: api/command.ts:174

Commands whose `when` passes for this context, in registration order. #160: `ctx` is optional —
 omit it and the registry builds the same live context `run(id)` already builds internally, so a
 caller never hand-assembles one just to answer "what can run right now?".

#### Parameters

##### ctx?

[`CommandContextOf`](CommandContextOf.md)\<`TGantt`, `TDataset`\>

#### Returns

readonly [`CommandOf`](CommandOf.md)\<`TGantt`, `TDataset`\>[]

***

### register()

> **register**(`command`): [`Disposer`](../type-aliases/Disposer.md)

Defined in: api/command.ts:169

#155: registering an id a command already holds stacks on top of it rather than replacing it.
 The newest registration answers `run`, and the returned `Disposer` removes exactly this one —
 the command underneath then answers again, which is how a plugin's override of a core command
 undoes itself when that plugin is uninstalled (D-S5-7).

#### Parameters

##### command

[`CommandOf`](CommandOf.md)\<`TGantt`, `TDataset`\>

#### Returns

[`Disposer`](../type-aliases/Disposer.md)

***

### run()

> **run**(`id`): `void`

Defined in: api/command.ts:170

#### Parameters

##### id

[`CommandId`](../type-aliases/CommandId.md)

#### Returns

`void`
