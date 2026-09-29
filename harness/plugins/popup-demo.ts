// harness/plugins/ — written as if by a third party: everything below comes from 'freegantt', the
// package's own public entry, never a path inside 'freegantt/src' (S5.6, [S5-A2]).

import { createPopup } from 'freegantt';
import type { ChromePlugin, EntryId, GanttDom, Popup } from 'freegantt';

/** What the page holds after installing: the plugin itself, plus the one call its button makes.
 *  This is the library's supported answer to "how does page scope reach what a plugin built in
 *  `view()`". The plugin object is the handle.
 *
 *  #178: this used to be a module-level `let demoView`, excused as "one stash serves every page,
 *  because each page mounts one Gantt". The excuse fails the moment a page mounts two (I2, and
 *  CLAUDE.md's "no module-level singletons anywhere"). Nothing in `src/` had to change. What a
 *  plugin builds belongs to that plugin, and one `popupDemo()` call is one Gantt's worth of it. */
export interface PopupDemoPlugin extends ChromePlugin {
  /** Opens the demo popup on one entry's bar. Answers `false` before a Gantt has installed this
   *  plugin, and for an entry with no bar in the current frame. */
  openOn(entry: EntryId): boolean;
}

export function popupDemo(): PopupDemoPlugin {
  /** Held per `popupDemo()` call, so two Gantts on one page hold two of these and share nothing.
   *  S5.3: a plugin's `view()` half is the only place `ctx.view` reaches page scope.
   *
   *  It keeps `ctx.view.dom` beside the `Popup`: finding an entry's bar is the library's job.
   *  `ctx.view.dom.barFor(id)` replaces the raw `#gantt .fg-bar[data-bar-id="…"]` selector the two
   *  harness pages used to write for themselves (review H2, N1). */
  let view: { popup: Popup; dom: GanttDom } | undefined;

  return {
    id: 'harness.popupDemo',

    view(ctx) {
      // C3, plans/reviews/2026-09-02-s5-start-fixes.md: `createPopup`'s Escape dismissal folds into
      // the shared keymap now. So a plugin hands over `ctx.interaction.registerKeyHandler` — the one
      // bound method it has, not a full `Keymap` instance.
      view = {
        popup: createPopup(ctx.view, ctx.interaction.registerKeyHandler),
        dom: ctx.view.dom,
      };
      return () => {
        view = undefined;
      };
    },

    openOn(entry) {
      const anchor = view?.dom.barFor(entry);
      if (view === undefined || anchor === undefined) return false;
      view.popup.open({
        anchor,
        placement: 'end',
        dismissOn: ['escape', 'outsidePointer', 'scroll'],
        content: { style: { padding: '6px 10px', font: 'inherit' }, text: `Entry: ${entry}` },
      });
      return true;
    },
  };
}
