// harness/plugins/ — written as if by a third party: everything below comes from 'freegantt', the
// package's own public entry, never a path inside 'freegantt/src' (S5.9, [S5-A3]). A grep over
// `src/` for the string `'buffer'` finds nothing — the whole kind lives here, in one plugin.

import { wholeEntryItem } from 'freegantt';
import type { EntryEdit, EntryId, GanttPlugin } from 'freegantt';

const BUFFER_KIND = 'buffer';

/** A consumer-defined `'buffer'` look, proven through the seams D-S5-22 names: which entries wear it
 *  (`ctx.layout.registerLookClaim`), what shape it
 *  draws (`ctx.layout.registerItemProducer`), how it looks (`ctx.view.registerRenderer('bar', …)`),
 *  what you can do to it (`ctx.interaction.registerLookDefaults` — no resize, a buffer has no edge
 *  worth dragging), and what actions it offers (`ctx.commands.register` with a `when` scoped to the
 *  look). Zero core edits.
 *
 *  ADR 0013: `Entry` carries no stored classification any more, so this plugin stores which ids it
 *  owns itself — `ownedIds`, named at construction — the same pattern the scheduling plugin's own
 *  pin flag and Dependency data use (ADR 0002). Its look claim answers "is this mine?" from that
 *  same `Set`, and its producer then draws whatever the claim won — two registrations, one question
 *  each (Q10). Before that ruling the producer answered both by drawing and returning `[]` for an
 *  entry it did not own, which made core build Items only to count and discard them. */
export function bufferKind(ownedIds: Iterable<string>): GanttPlugin {
  const owned = new Set<EntryId>(ownedIds as Iterable<EntryId>);
  return {
    id: 'demo.bufferKind',
    setup(ctx) {
      // Which entries are mine? The ids this plugin owns. Core asks this before anything draws, so
      // no producer has to answer it by drawing (Q10).
      ctx.layout.registerLookClaim(BUFFER_KIND, (entry) => owned.has(entry.id));

      // What shape does it draw? One whole-entry Item, same as a parent or a leaf with no segments —
      // a buffer has no internal structure to slice. `wholeEntryItem` is the library's own, so the
      // Item id convention has one owner (review P3).
      ctx.layout.registerItemProducer(BUFFER_KIND, (entry) => [wholeEntryItem(entry, BUFFER_KIND)]);

      // How does it look? A hatched fill, painted through the ordinary bar renderer seam — no
      // bespoke paint path.
      ctx.view.registerRenderer('bar', {
        [BUFFER_KIND]: () => ({ class: { 'demo-buffer-bar': true } }),
      });

      // What can you do to it? Move and select stay at the library default; resize refuses — a
      // buffer's length comes from the schedule around it, not a drag.
      ctx.interaction.registerLookDefaults(BUFFER_KIND, { resize: false });

      // What actions does it offer? One menu item, scoped to the ids this plugin owns alone — every
      // other entry's context menu is unaffected.
      ctx.commands.register({
        id: 'demo.bufferKind.markConsumed',
        label: 'Mark buffer consumed',
        when: ({ entry }) => entry !== undefined && owned.has(entry.id),
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
