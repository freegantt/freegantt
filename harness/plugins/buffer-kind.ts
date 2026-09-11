// harness/plugins/ — written as if by a third party: everything below comes from 'freegantt', the
// package's own public entry, never a path inside 'freegantt/src' (S5.9, [S5-A3]). A grep over
// `src/` for the string `'buffer'` finds nothing — the whole kind lives here, in one plugin.

import { wholeEntryItem } from 'freegantt';
import type { EntryEdit, GanttPlugin } from 'freegantt';

const BUFFER_KIND = 'buffer';

/** A consumer-defined `'buffer'` kind, proven through the four seams D-S5-22 names: what shape it
 *  draws (`ctx.layout.registerItemProducer`), how it looks (`ctx.view.registerRenderer('bar', …)`),
 *  what you can do to it (`ctx.interaction.registerKindDefaults` — no resize, a buffer has no edge
 *  worth dragging), and what actions it offers (`ctx.commands.register` with a `when` scoped to the
 *  kind). Zero core edits. */
export function bufferKind(): GanttPlugin {
  return {
    id: 'demo.bufferKind',
    setup(ctx) {
      // What shape does it draw? One whole-entry Item, same as a group or a span with no segments —
      // a buffer has no internal structure to slice. `wholeEntryItem` is the library's own, so the
      // Item id convention has one owner (review P3).
      ctx.layout.registerItemProducer(BUFFER_KIND, (entry) => [wholeEntryItem(entry)]);

      // How does it look? A hatched fill, painted through the ordinary bar renderer seam — no
      // bespoke paint path.
      ctx.view.registerRenderer('bar', {
        [BUFFER_KIND]: () => ({ class: { 'demo-buffer-bar': true } }),
      });

      // What can you do to it? Move and select stay at the library default; resize refuses — a
      // buffer's length comes from the schedule around it, not a drag.
      ctx.interaction.registerKindDefaults(BUFFER_KIND, { resize: false });

      // What actions does it offer? One menu item, scoped to this kind alone by `when` — every
      // other kind's context menu is unaffected.
      ctx.commands.register({
        id: 'demo.bufferKind.markConsumed',
        label: 'Mark buffer consumed',
        when: ({ entry }) => entry?.kind === BUFFER_KIND,
        run: ({ entry }) => {
          if (entry === undefined) return;
          // The Dataset's own TProps is unknown to this untyped plugin (ADR 0011: an untyped GanttPlugin
          // sees no declared keys through EntryEdit<unknown>'s flat mapped part) — `consumed` is
          // declared on the harness's own Dataset (harness/plugins.ts), so this write is real at
          // runtime; the cast bridges the static gap an untyped plugin cannot close.
          ctx.dataset.entries.update(entry.id, { consumed: true } as EntryEdit);
        },
      });

      // No disposer: `ctx.disposables` already retracts all four registrations (review P4).
    },
  };
}
