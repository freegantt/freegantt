// extensions/ — chord parsing and newest-first key resolution (S5.2, D-S5-7).

import type { KeyBindingOf } from '../api/command.js';
import type { CommandContext } from './commands.js';
import type { CommandRegistry } from './commands.js';

export type KeyBinding<TGantt = unknown> = KeyBindingOf<TGantt>;

interface NormalizedChord {
  key: string;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
}

/** The one place this file branches on platform (D-S5-7). `userAgentData` first, `platform` as the
 *  fallback for engines that do not ship it yet; empty string (no `navigator`, e.g. under Node) reads
 *  as non-Apple. */
function isApplePlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  const uaDataPlatform = (navigator as { userAgentData?: { platform?: string } }).userAgentData?.platform;
  const platform = uaDataPlatform ?? navigator.platform ?? '';
  return /mac|iphone|ipad|ipod/i.test(platform);
}

/** Parses a `KeyChord` once, at registration — D-S5-7: "never re-parsed per event" (I5's spirit).
 *  `Mod` resolves against `applePlatform` here, so the resulting record never branches on platform
 *  again at match time. */
export function normalizeChord(chord: string, applePlatform: boolean = isApplePlatform()): NormalizedChord {
  const parts = chord.split('+').map((part) => part.trim());
  const key = parts[parts.length - 1]!.toLowerCase();
  const modifiers = new Set(parts.slice(0, -1).map((part) => part.toLowerCase()));
  const usesMod = modifiers.has('mod');
  return {
    key,
    ctrl: modifiers.has('ctrl') || (usesMod && !applePlatform),
    meta: modifiers.has('meta') || (usesMod && applePlatform),
    shift: modifiers.has('shift'),
    alt: modifiers.has('alt'),
  };
}

/** The subset of `KeyboardEvent` the resolver reads — kept narrow so a test can build one with a
 *  plain object instead of constructing a real `KeyboardEvent`. */
export interface KeyEventLike {
  key: string;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  isComposing: boolean;
  target: EventTarget | null;
}

function chordMatches(chord: NormalizedChord, event: KeyEventLike): boolean {
  return (
    chord.key === event.key.toLowerCase() &&
    chord.ctrl === event.ctrlKey &&
    chord.shift === event.shiftKey &&
    chord.alt === event.altKey &&
    chord.meta === event.metaKey
  );
}

/** Issue #137 F7: typing in an editable target, or mid-IME-composition, runs no binding unless it
 *  opts in with `captureInEditable`. */
export function isEditableTarget(event: Pick<KeyEventLike, 'isComposing' | 'target'>): boolean {
  if (event.isComposing) return true;
  const el = event.target;
  if (!(el instanceof HTMLElement)) return false;
  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return true;
  // `isContentEditable` walks the whole ancestor chain in a real browser, but jsdom (this repo's
  // test DOM, `plans/01` §9) never implements it — the attribute check below is what both agree on.
  return el.isContentEditable || el.getAttribute('contenteditable') === 'true';
}

interface RegisteredBinding<TGantt> {
  binding: KeyBindingOf<TGantt>;
  chord: NormalizedChord;
}

/** D-S5-7's registry: every registered `KeyBinding`, resolved newest-first on every key event. One
 *  instance per `GanttShell` — core registers first (index 0), so a later plugin's binding is checked
 *  before it, which is the whole reason a plugin can override core. `commands`/`buildContext` are
 *  fixed for the instance's lifetime (its only caller, `GanttShell`, rebuilds neither per keystroke),
 *  so they are constructor-injected rather than repeated on every `resolve()` call. */
export class Keymap<TGantt = unknown> {
  #bindings: RegisteredBinding<TGantt>[] = [];
  #commands: CommandRegistry<TGantt>;
  #buildContext: () => CommandContext<TGantt>;

  constructor(commands: CommandRegistry<TGantt>, buildContext: () => CommandContext<TGantt>) {
    this.#commands = commands;
    this.#buildContext = buildContext;
  }

  /** Returns a disposer that removes this binding — a plugin's own `ctx.disposables.add(...)` target
   *  (D-S5-1's disposal pattern; S5.2's `registerKeybinding` calls this and hands the result over). */
  register(binding: KeyBindingOf<TGantt>): () => void {
    const entry: RegisteredBinding<TGantt> = { binding, chord: normalizeChord(binding.chord) };
    this.#bindings.push(entry);
    return () => {
      const index = this.#bindings.indexOf(entry);
      if (index >= 0) this.#bindings.splice(index, 1);
    };
  }

  /** Resolves `event` against every registered binding, newest first: the first one whose chord
   *  matches and whose (and whose command's) `when` both pass runs — through
   *  `commands.run(binding.command)`, the same call a menu item makes (D-S5-7), so a veto or a guard
   *  written once holds for both. A binding naming an id nothing owns is skipped, not thrown for — a
   *  keystroke is not the moment to surface a plugin's misconfigured id. Returns whether anything
   *  fired, so the caller knows whether to `preventDefault()`; an unmatched chord leaves the event
   *  untouched, so the browser keeps it. */
  resolve(event: KeyEventLike): boolean {
    const editable = isEditableTarget(event);
    for (let i = this.#bindings.length - 1; i >= 0; i--) {
      const { binding, chord } = this.#bindings[i]!;
      if (editable && binding.captureInEditable !== true) continue;
      if (!chordMatches(chord, event)) continue;
      const command = this.#commands.find(binding.command);
      if (command === undefined) continue;
      const ctx = this.#buildContext();
      if (binding.when !== undefined && !binding.when(ctx)) continue;
      if (command.when !== undefined && !command.when(ctx)) continue;
      this.#commands.run(binding.command);
      return true;
    }
    return false;
  }
}
