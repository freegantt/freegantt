// api/ — the public command and keybinding contract (S5.2, D-S5-6, D-S5-7). Generic over `TGantt`
// here for the same reason `api/plugin.ts`'s `GanttPlugin`/`PluginContext` are (S5.1 file header):
// `api/gantt.ts` already imports this file for the generic shape, and if this file also imported
// `Gantt` the two would close an import cycle (`extensions/commands.ts` needs the generic form too,
// and `api/gantt.ts` imports `extensions/commands.ts` to build the real registry). `api/gantt.ts`
// binds the type argument once, locally — `export type CommandContext = CommandContextOf<Gantt>` —
// and that bound alias is what `api/index.ts` re-exports; a plugin author's
// `import type { CommandContext } from 'freegantt'` always resolves to it, never to the generic
// declared here.

import type { Entry, EntryId, FieldKey, KeyChord } from '../model/index.js';
import type { Dataset } from './dataset.js';

/** What focus a chord or a right-click landed on (issue #137 F6) — S5.7's and S5.11's chord scoping
 *  ("on a focused header cell", "on a selected bar", "on the splitter") has nothing else in
 *  `CommandContext` to read a `when` against. Filled by the keymap resolver from view state; a menu
 *  or `run(id)` invocation with no meaningful target for this kind leaves it `undefined`. */
export interface CommandTarget {
  kind: 'row' | 'cell' | 'bar' | 'header' | 'splitter';
  rowId?: EntryId;
  columnKey?: FieldKey;
}

/** What a `Command`'s `when`/`run` receives, once per invocation — a menu click, a chord, or
 *  `gantt.commands.run(id)`. S5.2 ships `dataset`/`gantt` (read the same way `PluginContext` does)
 *  plus `entry`/`target`; nothing here is privileged beyond the public `Gantt`/`Dataset` surface. */
export interface CommandContextOf<TGantt = unknown> {
  /** The public Dataset. No privileged access, no second surface. */
  dataset: Dataset;
  /** The public Gantt, for reading live config and calling public methods. */
  gantt: TGantt;
  /** The entry the invocation targeted: the right-clicked bar, the focused row, or none. */
  entry?: Entry;
  target?: CommandTarget;
}

/** A named, invokable action with a label and a condition (D-S5-6). No `TArgs` generic — every
 *  invocation path in S5 is argument-less (issue #137 G); see the step file for why a generic here
 *  would be type-unsound at the registry boundary. */
export interface CommandOf<TGantt = unknown> {
  id: string;
  /** Menu text; also the a11y name. */
  label: string;
  /** Static availability. Absent means always available. */
  when?(ctx: CommandContextOf<TGantt>): boolean;
  run(ctx: CommandContextOf<TGantt>): void;
}

/** D-S5-6: register once, run by id, list what a `CommandContext` currently allows. `run` throws
 *  `UnknownCommandError` for an id nothing owns; a registered command whose `when` declines is a
 *  silent no-op, the same posture `available`'s own filter takes. */
export interface CommandRegistryOf<TGantt = unknown> {
  register(command: CommandOf<TGantt>): void;
  run(id: string): void;
  /** Commands whose `when` passes for this context, in registration order. */
  available(ctx: CommandContextOf<TGantt>): readonly CommandOf<TGantt>[];
}

/** D-S5-7: newest-first resolution — the last registration gets first refusal, and a decline falls
 *  through to an older binding. `Mod` means `⌘` on Apple platforms and `Ctrl` elsewhere. */
export interface KeyBindingOf<TGantt = unknown> {
  chord: KeyChord;
  command: string;
  /** Extra condition beyond the command's own `when`. */
  when?(ctx: CommandContextOf<TGantt>): boolean;
  /** Fire even while the event's target is editable or mid-IME-composition. Default `false`
   *  (issue #137 F7). */
  captureInEditable?: boolean;
}
