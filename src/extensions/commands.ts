// extensions/ — the command registry (S5.2, D-S5-6). Generic over its own `TGantt`, for the same
// reason `PluginRuntime` is (`plugin-runtime.ts`'s file header): `view/gantt-shell.ts` builds one
// with `TGantt = unknown` — `view/` may not import `api/command.ts` (plans/01 §1) — and `api/gantt.ts`
// alone binds it to the real `Gantt`. `view/` reaches the bound types (`Command`, `CommandContext`,
// `CommandTarget`) through this file's own re-export, the same seam `ShellPlugin` already gives it.

import { UnknownCommandError } from '../model/index.js';
import type {
  CommandOf,
  CommandContextOf,
  CommandRegistryOf,
  CommandTarget as CommandTargetType,
} from '../api/command.js';

export type Command<TGantt = unknown> = CommandOf<TGantt>;
export type CommandContext<TGantt = unknown> = CommandContextOf<TGantt>;
export type CommandTarget = CommandTargetType;
export type { CommandRegistryOf };

/** D-S5-6's registry. Built once per `GanttShell` (or per test) with a live context builder — called
 *  fresh on every `run()`, so a command always sees the invocation's current selection/target, never
 *  a snapshot from registration time. */
export class CommandRegistry<TGantt = unknown> implements CommandRegistryOf<TGantt> {
  #commands = new Map<string, CommandOf<TGantt>>();
  #buildContext: () => CommandContextOf<TGantt>;

  constructor(buildContext: () => CommandContextOf<TGantt>) {
    this.#buildContext = buildContext;
  }

  register(command: CommandOf<TGantt>): void {
    this.#commands.set(command.id, command);
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

  available(ctx: CommandContextOf<TGantt>): readonly CommandOf<TGantt>[] {
    return [...this.#commands.values()].filter((command) => command.when === undefined || command.when(ctx));
  }
}
