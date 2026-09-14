# Type Alias: KeyChord

> **KeyChord** = `string`

Defined in: model/command.ts:11

A chord string: `'ArrowRight'`, `'Mod+Z'`, `'Shift+F10'`, `'Alt+ArrowLeft'`. `Mod` resolves to
 `⌘` on Apple platforms and `Ctrl` elsewhere (D-S5-7) — the resolver is the only place that
 branches on it. Parsed once, at registration, never per key event.
