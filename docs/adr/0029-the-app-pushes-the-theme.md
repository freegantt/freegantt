---
status: accepted — ruled 2026-09-19, out of [#433](https://github.com/Pawel-IT/FreeGantt/issues/433).
Overturns the `ThemeResolver` design that branch first carried.
decided: `theme` takes three literals — `'auto' | 'light' | 'dark'`. The app resolves its own
dark-mode signal and **pushes** the answer, by writing `gantt.theme` or by pinning `data-fg-theme`
on an ancestor. The library never calls back into the app to ask, and never watches an attribute or
a class it does not own.
open: none. `'auto'` keeps its two sources — an ancestor `data-fg-theme` pin, then
`prefers-color-scheme` — because both are ours to read.
---

# The app pushes the theme; the library never asks

## Context

[#433](https://github.com/Pawel-IT/FreeGantt/issues/433) is a real gap. A wrapping app usually
carries its own dark-mode signal, and it is rarely the two signals `theme: 'auto'` reads. Tailwind
and `next-themes` write a `dark` class on `<html>`. Bootstrap 5.3 writes `data-bs-theme`. A Gantt
inside such an app sits on `'auto'`, reads `prefers-color-scheme`, and goes light while everything
around it is dark.

The first answer on the branch was a `ThemeResolver`: `theme` also accepted a function, the library
called it whenever the theme question might have moved, and a widened `MutationObserver` watched the
app's own attributes so the call happened at the right moment.

It cost two infinite loops before it worked. The observer woke on `data-fg-theme`, which
`#applyTheme` then wrote; a same-value `setAttribute` still queues a mutation record in Chromium, so
the write re-entered the observer that caused it. The failure path had a second loop of its own — a
`removeAttribute` followed by a re-add is two real mutations. Both were fixed. Both were symptoms.

## Evidence

No mainstream library in this class invokes a consumer callback to learn the colour mode. Control
runs app -> library, always.

| Library | How the app tells it | Does it ask back? |
|---|---|---|
| AG Grid ([theming-colors](https://www.ag-grid.com/javascript-data-grid/theming-colors/)) | Swap the `theme` grid option, or leave the default `colorSchemeVariable` part in place and set `data-ag-theme-mode="dark"` on `<html>`, `<body>`, or any ancestor carrying `ag-theme-mode` | No. The docs give no hook that asks the application which mode to use, and `prefers-color-scheme` appears nowhere. `browserColorScheme` is a paint parameter, not a read of the user's preference. |
| Bootstrap 5.3 ([color-modes](https://getbootstrap.com/docs/5.3/customize/color-modes/)) | The app writes `data-bs-theme="dark"` on `<html>` or on any subtree | No. The mechanism is CSS selectors from the `color-mode()` mixin. *"Nothing in Bootstrap's JS bundle participates."* |

Bootstrap settles the harder half of the question too. Its own reference toggle resolves `'auto'` in
**the app's** code into a literal `'light'` or `'dark'` before writing the attribute, and Bootstrap
ships no `[data-bs-theme=auto]` rules at all. The app already owns a resolution step. It has a
`matchMedia` listener, it has storage, it has a toggle. Asking it to pass us the answer it already
computed costs it one line. Asking us to recompute that answer costs an observer, a re-entrancy
guard, a failure mode, and a public error code.

## Decision

`theme` is `'auto' | 'light' | 'dark'`. Nothing else.

An app with its own dark-mode signal writes the answer where the Gantt already looks:

```ts
// The app's toggle already knows. One more line and the Gantt knows too.
gantt.theme = isDark ? 'dark' : 'light';
```

or pins an ancestor once and never touches the Gantt again:

```html
<div data-fg-theme="dark"><div id="gantt"></div></div>
```

The pin is the recipe for an app that flips a class on `<html>`: mirror the class onto one wrapper
with `data-fg-theme`, in the same toggle that sets the class. `harness/e2e/theme-push.html` demonstrates
both.

`'auto'` keeps reading an ancestor's `data-fg-theme` pin and then `prefers-color-scheme`. Both are
signals we define or the platform defines. Neither is a guess at a convention some framework holds.

## Consequences

**A function never becomes a config value.** `AGENTS.md` already holds the reason, for Aggregators:
*a name serializes into a document and a function does not*. A `ThemeResolver` broke that for a key
whose whole job is to name a colour. The three literals serialize; a closure over an app's store
does not.

`theme` is runtime config, not a document field, so this reason needs its own evidence, not a
borrowed one. `harness/gantt-toolbar.ts` has `storeTheme`/`readStoredTheme`: the toolbar writes the
app's theme choice to `localStorage` and reads it back on load. Three literals round-trip through
that store with no help. A `ThemeResolver` closure cannot: a function is not a value `JSON.stringify`
can carry, so the toolbar could persist only the closure's last computed answer, never the rule that
produced it.

**The re-entrancy class is gone, not guarded.** The observer still watches `data-fg-theme`, and the
library's own write in `#applyTheme` still re-enters it (`src/view/gantt-shell.ts:1104-1107`). What
changed is what the callback does: it now only reads the resolved theme and, if the answer moved,
fires an event. It writes nothing back, so a self-write cannot trigger a second write, and the loop
has nowhere to start. The `theme-resolver-failed` error code, the reported-once `WeakSet`, and the
side-effecting getter all go with it — surface that existed only to survive the design.

**We do less than `'auto'` promises, on purpose.** An app that changes its `dark` class without
telling us shows a stale Gantt until it does. That is the same contract AG Grid and Bootstrap ship,
and the cost lands in one line of app code rather than in a permanent observer over a document we
do not control.

**`checkResolvedTheme()` stays.** An app that moves the Gantt under a differently-pinned wrapper
changes the answer without changing any attribute, so there is one explicit re-ask. It is a method,
called once, not a subscription.
