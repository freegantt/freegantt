// extensions/ — chord parsing and newest-first key resolution (S5.2, D-S5-7).

import type { KeyBindingOf } from '../api/command.js';
import type { CommandContext } from './commands.js';
import type { CommandRegistry } from './commands.js';

export type KeyBinding<TGantt = unknown> = KeyBindingOf<TGantt>;
// #166: `view/plugin-ports.ts` names the public symbol itself, not this file's alias of it. That
// type is public now, and api-extractor prints a second, private name for an alias it cannot reach
// from the entry point. `view/` may not import `api/` (I1), so the re-export travels through here.
export type { KeyBindingOf };

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
 *  plain object instead of constructing a real `KeyboardEvent`. `stopPropagation` is here for a
 *  `registerHandler` callback (below) that wants to stop an event dead, the same way a popup's
 *  Escape dismissal does — a plain object test still needs to supply a stub. */
export interface KeyEventLike {
  key: string;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  isComposing: boolean;
  target: EventTarget | null;
  stopPropagation(): void;
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

/** The one method a caller that only needs command-less chord handlers depends on — `Keymap` itself
 *  satisfies this structurally, and so does the small adapter `extensions/popup.ts` builds from
 *  `PluginContextOf.interaction.registerKeyHandler` when a third-party plugin builds its own
 *  `Popup` (that plugin has no `Keymap` instance to hand over, only the one bound method). */
export interface KeyHandlerRegistrar {
  registerHandler(
    chord: string,
    handler: (event: KeyEventLike) => void,
    options?: { captureInEditable?: boolean },
  ): () => void;
}

interface CommandBinding<TGantt> {
  kind: 'command';
  binding: KeyBindingOf<TGantt>;
  chord: NormalizedChord;
}

/** A chord bound straight to a callback instead of a registered `Command` id (C3,
 *  `plans/reviews/2026-09-02-s5-start-fixes.md`) — for a caller that wants the keymap's own
 *  newest-first resolution and editable/IME gating, but has no `Command` to run and no wish to
 *  leak an internal id into `CommandRegistry.available()`/the command palette. `extensions/popup.ts`'s
 *  Escape dismissal is the first of these. */
interface HandlerBinding {
  kind: 'handler';
  handler: (event: KeyEventLike) => void;
  captureInEditable: boolean;
  chord: NormalizedChord;
}

type RegisteredEntry<TGantt> = CommandBinding<TGantt> | HandlerBinding;

/** D-S5-7's registry: every registered `KeyBinding` or raw handler, resolved newest-first on every
 *  key event. One instance per `GanttShell` — core registers first (index 0), so a later plugin's
 *  binding is checked before it, which is the whole reason a plugin can override core, and a popup
 *  registering its Escape dismissal last is why the innermost open popup wins over an outer
 *  binding (D-S5-9). `commands`/`buildContext` are fixed for the instance's lifetime (its only
 *  caller, `GanttShell`, rebuilds neither per keystroke), so they are constructor-injected rather
 *  than repeated on every `resolve()` call. */
export class Keymap<TGantt = unknown> implements KeyHandlerRegistrar {
  #entries: RegisteredEntry<TGantt>[] = [];
  #commands: CommandRegistry<TGantt>;
  #buildContext: () => CommandContext<TGantt>;

  constructor(commands: CommandRegistry<TGantt>, buildContext: () => CommandContext<TGantt>) {
    this.#commands = commands;
    this.#buildContext = buildContext;
  }

  /** Returns a disposer that removes this binding — a plugin's own `ctx.disposables.add(...)` target
   *  (D-S5-1's disposal pattern; S5.2's `registerKeybinding` calls this and hands the result over). */
  register(binding: KeyBindingOf<TGantt>): () => void {
    const entry: CommandBinding<TGantt> = { kind: 'command', binding, chord: normalizeChord(binding.chord) };
    return this.#push(entry);
  }

  /** Registers a raw chord → callback, resolved by the same newest-first pass as `register()` —
   *  see `HandlerBinding` above for why this exists alongside it. Default `captureInEditable: false`
   *  matches `register()`'s own default: the chord is ignored while the event's target is editable
   *  or mid-IME-composition unless the caller opts in. */
  registerHandler(
    chord: string,
    handler: (event: KeyEventLike) => void,
    options?: { captureInEditable?: boolean },
  ): () => void {
    const entry: HandlerBinding = {
      kind: 'handler',
      handler,
      captureInEditable: options?.captureInEditable ?? false,
      chord: normalizeChord(chord),
    };
    return this.#push(entry);
  }

  #push(entry: RegisteredEntry<TGantt>): () => void {
    this.#entries.push(entry);
    return () => {
      const index = this.#entries.indexOf(entry);
      if (index >= 0) this.#entries.splice(index, 1);
    };
  }

  /** Resolves `event` against every registered binding, newest first: the first one whose chord
   *  matches and whose (and whose command's) `when` both pass runs — through
   *  `commands.run(binding.command)`, the same call a menu item makes (D-S5-7), so a veto or a guard
   *  written once holds for both; a `registerHandler` entry runs its callback directly instead. A
   *  binding naming an id nothing owns is skipped, not thrown for — a keystroke is not the moment to
   *  surface a plugin's misconfigured id. Returns whether anything fired, so the caller knows
   *  whether to `preventDefault()`; an unmatched chord leaves the event untouched, so the browser
   *  keeps it. */
  resolve(event: KeyEventLike): boolean {
    const editable = isEditableTarget(event);
    for (let i = this.#entries.length - 1; i >= 0; i--) {
      const entry = this.#entries[i]!;
      const captureInEditable =
        entry.kind === 'command' ? entry.binding.captureInEditable === true : entry.captureInEditable;
      if (editable && !captureInEditable) continue;
      if (!chordMatches(entry.chord, event)) continue;
      if (entry.kind === 'handler') {
        entry.handler(event);
        return true;
      }
      const command = this.#commands.find(entry.binding.command);
      if (command === undefined) continue;
      const ctx = this.#buildContext();
      if (entry.binding.when !== undefined && !entry.binding.when(ctx)) continue;
      if (command.when !== undefined && !command.when(ctx)) continue;
      // D-S5-7: resolve once, run once — `runResolved` trusts the `when` checks just made above
      // instead of `run(id)` rebuilding `ctx` and re-running both checks for the same keystroke.
      this.#commands.runResolved(entry.binding.command, ctx);
      return true;
    }
    return false;
  }
}
