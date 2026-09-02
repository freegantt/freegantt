// model/ — zero-dependency primitive for commands and keybindings (S5.2, D-S5-6, D-S5-7). `Command`,
// `CommandContext` and `KeyBinding` all name `Dataset`/`Gantt` (`api/` classes) or a context generic
// bound to them, so — the same reasoning `model/plugin.ts`'s file header gives for
// `GanttPlugin`/`PluginContext` (S5.1, issue #137 F1) — they live in `api/command.ts`, not here.
// `KeyChord` alone has zero dependencies and is shared by the api-level `KeyBinding` and
// `extensions/keymap.ts`'s parser, so it stays the one primitive this file declares.

/** A chord string: `'ArrowRight'`, `'Mod+Z'`, `'Shift+F10'`, `'Alt+ArrowLeft'`. `Mod` resolves to
 *  `⌘` on Apple platforms and `Ctrl` elsewhere (D-S5-7) — the resolver is the only place that
 *  branches on it. Parsed once, at registration, never per key event. */
export type KeyChord = string;
