// harness/plugins/ — written as if by a third party: everything below comes from 'freegantt', the
// package's own public entry, never a path inside 'freegantt/src' (S5.9, [S5-A3]). A grep over
// `src/` for the string `'buffer'` finds nothing — the whole variant lives here, in one plugin.

import { definePlugin } from 'freegantt';

const BUFFER_VARIANT = 'buffer';

/** The key this plugin's command writes. A chrome plugin declares no Field, so the page declares
 *  `consumed` itself (`harness/editing-and-data.ts`); `entries.update()` refuses it if the page
 *  does not. */
export interface BufferKindProps {
  consumed?: boolean;
}

/** A consumer-defined `'buffer'` variant, over the two doors ADR 0018 leaves: one variant object,
 *  and one command.
 *
 *  The variant answers four questions in one place — which rows wear it, what shape it draws, how it
 *  looks, and what you can do to it. Before 0018 each was its own registration, and every one
 *  repeated the word `'buffer'`.
 *
 *  **The rule reads the row, so this plugin keeps no list of the ids it owns.** A page names the
 *  buffer rows in its own words, through its own Field, and a row that gains that value after
 *  install gets the variant on the next frame. */
export function bufferKind() {
  return definePlugin<BufferKindProps>({
    id: 'demo.bufferKind',
    view(ctx) {
      ctx.variants.add({
        name: BUFFER_VARIANT,
        // Which rows are mine? The ones the page marked as buffer. A field match is equality, so
        // this matches the rows whose `buffer` value **is** `true`.
        when: { buffer: true },
        // How does it look? A hatched fill, painted through the variant's own `paint` — no bespoke
        // paint path, and the library keeps painting the bar's label.
        paint: () => ({ class: { 'demo-buffer-bar': true } }),
        // What can you do to it? Move and select stay at the library default; resize refuses — a
        // buffer's length comes from the schedule around it, not a drag.
        capabilities: { resize: false },
        // What shape does it draw? A buffer row is never a segmented parent, so the default already
        // draws one whole-entry Bar (`wholeSpanUnlessSegments`, ADR 0023) — nothing is written here.
      });

      // What actions does it offer? One menu item, scoped to the rows this variant matched — every
      // other entry's context menu is unaffected. `variant` is the answer the library already
      // resolved, so this command never restates the rule above.
      ctx.commands.register({
        id: 'demo.bufferKind.markConsumed',
        label: 'Mark buffer consumed',
        when: ({ variant }) => variant === BUFFER_VARIANT,
        run: ({ entry }) => {
          if (entry === undefined) return;
          // The page declares `consumed` (`harness/editing-and-data.ts`), and `entries.update()`
          // refuses it with `UnknownFieldError` if the page does not.
          ctx.dataset.entries.update(entry.id, { consumed: true });
        },
      });

      // No disposer: `ctx.disposables` already retracts both registrations (review P4).
    },
  });
}
