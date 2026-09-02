// extensions/ — the plugin runtime + built-in features via PluginContext only (plans/01 §10). Touches the DOM.
// Lands in S5. Built-ins (tooltips, context menu, editors) dogfood the public plugin contract, no back-doors.
export { PluginRuntime, RegistrationGate } from './plugin-runtime.js';
export type { ShellPlugin, BuiltPluginContext } from './plugin-runtime.js';
export { DisposableStore } from './disposables.js';
export { CommandRegistry } from './commands.js';
export type { Command, CommandContext, CommandTarget } from './commands.js';
export { Keymap, normalizeChord, isEditableTarget } from './keymap.js';
export type { KeyBinding, KeyEventLike } from './keymap.js';
