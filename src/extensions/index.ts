// extensions/ — the plugin runtime + built-in features via PluginContext only (plans/01 §10). Touches the DOM.
// Lands in S5. Built-ins (tooltips, context menu, editors) dogfood the public plugin contract, no back-doors.
export { PluginRuntime, RegistrationGate } from './plugin-runtime.js';
export type { ShellPlugin, BuiltPluginContext } from './plugin-runtime.js';
export { DisposableStore } from './disposables.js';
export { CommandRegistry } from './commands.js';
export type { Command, CommandContext, CommandTarget } from './commands.js';
export { Keymap, normalizeChord, isEditableTarget } from './keymap.js';
export type { KeyBinding, KeyEventLike } from './keymap.js';
// S5.5, D-S5-13/14: the two shipped built-ins — ordinary plugins in `extensions/features/`, zero
// private imports (the `extensions-public-only` depcruise rule already confines this whole
// directory to `api/`/`model/`), the dogfood gate `[S5-A1]` proves.
export { tooltips } from './features/tooltips.js';
export type { TooltipsOptions } from './features/tooltips.js';
export { contextMenu } from './features/context-menu.js';
export type { ContextMenuOptions, MenuItem, MenuEntry } from './features/context-menu.js';
