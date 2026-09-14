# Type Alias: Command\<TProps\>

> **Command**\<`TProps`\> = [`CommandOf`](../interfaces/CommandOf.md)\<[`Gantt`](../classes/Gantt.md)\<`TProps`\>, [`Dataset`](../classes/Dataset.md)\<`TProps`\>\>

Defined in: api/gantt.ts:256

S5.2, D-S5-6: `Command`/`CommandContext`/`CommandRegistry`/`KeyBinding` bound to this class — see
 `api/command.ts`'s file header for why the generic form lives there and the binding happens here.
 This is the shape a plugin author, or a `gantt.commands`/`gantt.commands.run(id)` caller, actually
 sees; `api/index.ts` re-exports these bound names alongside the generic `*Of` shapes.

## Type Parameters

### TProps

`TProps` = `unknown`
