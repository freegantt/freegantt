// model/ — zero-dependency primitive for commands and keybindings (S5.2, D-S5-6, D-S5-7). `Command`,
// `CommandContext` and `KeyBinding` all name `Dataset`/`Gantt` (`api/` classes) or a context generic
// bound to them, so — the same reasoning `model/plugin.ts`'s file header gives for
// the plugin shapes and `PluginContext` (S5.1, issue #137 F1) — they live in `api/command.ts`, not here.
// `KeyChord` and `TargetKind` have zero dependencies and each one is shared by two readers, so this
// file declares those two primitives and nothing else.

/** A chord string: `'ArrowRight'`, `'Mod+Z'`, `'Shift+F10'`, `'Alt+ArrowLeft'`. `Mod` resolves to
 *  `⌘` on Apple platforms and `Ctrl` elsewhere (D-S5-7) — the resolver is the only place that
 *  branches on it. Parsed once, at registration, never per key event. */
export type KeyChord = string;

/** What kind of thing a chord, a right-click or a pointer landed on (issue #137 F6, review A3). One
 *  vocabulary, shared by two readers: `api/command.ts`'s `CommandTarget.kind`, which a command's
 *  `when` reads, and `view/gantt-dom.ts`'s `DomTarget.kind`, which `ctx.view.dom.targetUnder` returns
 *  for a DOM node. Both name the same five things, so both name them from here — a second union
 *  would be the same concept spelled twice. Zero dependencies, so it belongs in `model/`.
 *
 *  `'cell'` is one Grid column's box on one Row; `'header'` is one Grid column's header cell. */
export type TargetKind = 'row' | 'cell' | 'bar' | 'header' | 'splitter';
