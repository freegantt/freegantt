// extensions/ — the command registry (S5.2, D-S5-6). Generic over its own `TGantt`, for the same
// reason `PluginRuntime` is (`plugin-runtime.ts`'s file header): `view/gantt-shell.ts` builds one
// with `TGantt = unknown` — `view/` may not import `api/command.ts` (plans/01 §1) — and `api/gantt.ts`
// alone binds it to the real `Gantt`. `view/` reaches the bound types (`Command`, `CommandContext`,
// `CommandTarget`) through this file's own re-export, the same seam `ShellPlugin` already gives it.

import { UnknownCommandError } from '../model/index.js';
import type { Disposer } from '../model/index.js';
// One named leaf, not a `layout/` edge (`.dependency-cruiser.cjs`, `extensions-public-only`): the
// registration mechanism every `register*` seam shares (#154, #155). A command id keyed to a stack
// is what makes a plugin's override of a core command undo itself on uninstall (D-S5-7).
import { createRegistrationTable } from '../layout/registration-table.js';
import { convenienceCommandIds } from '../api/command.js';
import type {
  BuiltInCommandId,
  ConvenienceCommandId,
  CommandOf,
  CommandContextOf,
  CommandRegistryOf,
  CommandTarget as CommandTargetType,
} from '../api/command.js';

/** #333: `view/core-commands.ts` types every registration against this, so a typo in a registered id
 *  fails to compile. It reaches the type here for the same reason it reaches `Command` here. */
export type { BuiltInCommandId };

/** #262: `view/convenience-chords.ts` resolves `Gantt.convenienceChords` against this — `view/` may
 *  not import `api/command.ts` (plans/01 §1), so it reaches both the type and the list through this
 *  file's own re-export, the same seam `BuiltInCommandId` already uses. */
export type { ConvenienceCommandId };
export { convenienceCommandIds };

export type Command<TGantt = unknown> = CommandOf<TGantt>;
export type CommandContext<TGantt = unknown> = CommandContextOf<TGantt>;
export type CommandTarget = CommandTargetType;
export type { CommandRegistryOf };

/** D-S5-6's registry. Built once per `GanttShell` (or per test) with a live context builder — called
 *  fresh on every `run()`, so a command always sees the invocation's current selection/target, never
 *  a snapshot from registration time. */
export class CommandRegistry<TGantt = unknown> implements CommandRegistryOf<TGantt> {
  /** #155: a stack per command id, not one slot. The core catalog registers first and never
   *  disposes, so it sits at the bottom of every id it owns; a plugin's override wins while that
   *  plugin lives, and the command underneath comes back the moment the plugin is uninstalled. */
  #commands = createRegistrationTable<string, CommandOf<TGantt>>();
  #buildContext: () => CommandContextOf<TGantt>;

  constructor(buildContext: () => CommandContextOf<TGantt>) {
    this.#buildContext = buildContext;
  }

  /** #155: the returned `Disposer` removes exactly this registration, in any disposal order. The
   *  command that then answers this id is the newest one still registered — the core catalog's own,
   *  where a plugin had overridden one. `view/gantt-shell.ts` hands a plugin's disposer to that
   *  plugin's `DisposableStore`; the core catalog drops its own, because core commands live as long
   *  as the Gantt does. */
  register(command: CommandOf<TGantt>): Disposer {
    return this.#commands.register(command.id, command);
  }

  /** `extensions/keymap.ts`'s resolver peeks a binding's target command, to check the command's own
   *  `when` before committing to that binding (D-S5-7), without running it. Not part of the public
   *  `CommandRegistryOf` contract — a plugin or app author only ever `register`/`run`/`available`. */
  find(id: string): CommandOf<TGantt> | undefined {
    return this.#commands.get(id);
  }

  /** `UnknownCommandError` for an id nothing owns. A registered command whose `when` declines is a
   *  silent no-op — the keymap resolver already checked `when` before choosing this id (D-S5-7), and
   *  a direct `gantt.commands.run(id)` call on a currently-unavailable command is not a mistake worth
   *  throwing over, the same posture a disabled menu item takes. */
  run(id: string): void {
    const command = this.#commands.get(id);
    if (command === undefined) throw new UnknownCommandError(id);
    const ctx = this.#buildContext();
    if (command.when !== undefined && !command.when(ctx)) return;
    command.run(ctx);
  }

  /** `extensions/keymap.ts`'s `resolve()` already built `ctx` and checked both the binding's and the
   *  command's own `when` before picking this id — running through `run(id)` here would rebuild the
   *  context and re-check `when` a second time for the same keystroke. Not part of the public
   *  `CommandRegistryOf` contract; `resolve()` is the only caller, and only once it has already
   *  confirmed `find(id)` returns a command. */
  runResolved(id: string, ctx: CommandContextOf<TGantt>): void {
    const command = this.#commands.get(id);
    if (command === undefined) throw new UnknownCommandError(id);
    command.run(ctx);
  }

  /** One command per id — the winning registration — in first-registration order, which is the
   *  catalog order a menu reads (`available`'s own doc on `CommandRegistryOf`). #160: an omitted `ctx`
   *  builds the same live context `run(id)` already builds internally. */
  available(ctx?: CommandContextOf<TGantt>): readonly CommandOf<TGantt>[] {
    const resolved = ctx ?? this.#buildContext();
    return this.#commands.active().filter((command) => command.when === undefined || command.when(resolved));
  }
}
