// harness/plugins/ — written as if by a third party: everything below comes from 'freegantt', the
// package's own public entry, never a path inside 'freegantt/src' (S5.6, [S5-A2]).

import { createPopup } from 'freegantt';
import type { EntryId, GanttDom, GanttPlugin, Popup } from 'freegantt';

/** S5.3, D-S5-8: a plugin's `setup()` is the only place `ctx.view` reaches page scope, so the demo
 *  stashes it once here and `openDemoPopup` below reads it. One stash serves every page that
 *  installs this plugin, because each page loads this module once and mounts one Gantt.
 *
 *  It keeps `ctx.view.dom` beside the `Popup`: finding an entry's bar is the library's job.
 *  `ctx.view.dom.barFor(id)` replaces the raw `#gantt .fg-bar[data-item-id="…"]` selector the two
 *  harness pages used to write for themselves (review H2, N1). */
let demoView: { popup: Popup; dom: GanttDom } | undefined;

export function popupDemo(): GanttPlugin {
  return {
    id: 'harness.popupDemo',
    setup(ctx) {
      // C3, plans/reviews/2026-09-02-s5-start-fixes.md: `createPopup`'s Escape dismissal folds into
      // the shared keymap now. So a plugin hands over `ctx.interaction.registerKeyHandler` — the one
      // bound method it has, not a full `Keymap` instance — wrapped to the small structural shape
      // `createPopup` asks for.
      demoView = {
        popup: createPopup(ctx.view, { registerHandler: ctx.interaction.registerKeyHandler }),
        dom: ctx.view.dom,
      };
      return () => {
        demoView = undefined;
      };
    },
  };
}

/** Opens the demo popup on one entry's bar. Answers `false` when the plugin is not installed, or
 *  when that entry has no bar in the current frame. */
export function openDemoPopup(entry: EntryId): boolean {
  const view = demoView;
  const anchor = view?.dom.barFor(entry);
  if (view === undefined || anchor === undefined) return false;
  view.popup.open({
    anchor,
    placement: 'end',
    dismissOn: ['escape', 'outsidePointer', 'scroll'],
    content: { style: { padding: '6px 10px', font: 'inherit' }, text: `Entry: ${entry}` },
  });
  return true;
}
