// api/ — the one door a plugin author writes their plugin through (ADR 0019). It imports both
// concrete classes, so nothing in `api/` may import it back: `api/index.ts` is its only reader.

import type { ChromePlugin, DataPlugin } from './gantt.js';

/**
 * Call: `definePlugin({ id: 'acme.locks', data(ctx) { … }, view(ctx) { … } })`.
 *
 * It returns the object it is given. What it adds is the type: it reads which halves the object
 * fills and narrows to that arm, so a plugin with a `data` half is a red squiggle the moment it
 * reaches `GanttOptions.plugins` — in the editor, not at mount.
 *
 * **One plugin, two halves, one install site.** `data(ctx)` declares Fields, claims the edit hook and
 * reserves the store; it is DOM-free and runs once this whole Dataset — the construction Rollup
 * included — is built (ADR 0031). `view(ctx)` registers
 * variants, renderers, commands and keys, and runs as a `Gantt` mounts. A plugin with a `data` half
 * installs on the `Dataset`: a `data` half declares what shapes the Dataset's own construction, and
 * a Dataset installs its plugins once. Every Gantt bound to that Dataset then runs `view` once, each
 * with its own context, so I2 holds by construction. A chrome-only plugin installs on the `Gantt`.
 *
 * ```ts
 * const scheduling = () =>
 *   definePlugin({
 *     id: 'freegantt.scheduling',
 *     requires: ['freegantt.calendar'],
 *     data(ctx) { … },
 *     view(ctx) { … },
 *   });
 *
 * const dataset = new Dataset({ entries, plugins: [scheduling()] });
 * const gantt = new Gantt({ dataset }); // its Fields, variants, bars and menu are already there
 * ```
 *
 * Wrap the call in a factory, as above. One factory call is one install's worth of state, which is
 * what keeps two Gantts on one page independent (I2).
 *
 * Pass `TProps` — `definePlugin<LockProps>({ … })` — to read and write the keys this plugin declares
 * off `ctx.dataset` and `ctx.gantt`, with no cast: `LockProps` names this plugin's own keys, not the
 * consumer's. `fields` is checked against it too, so a key `LockProps` does not name fails to
 * compile. Leave it off for a plugin that writes no Field of its own; naming it fixes the return type
 * to the arm, and leaving it off keeps whatever extra members the object declares, so a plugin that
 * publishes its own calls beside `id` (#178) keeps them.
 */
export function definePlugin<TProps = unknown, TPlugin extends ChromePlugin<TProps> = ChromePlugin<TProps>>(
  plugin: TPlugin,
): TPlugin;
/**
 * The arm a plugin with a `data` half resolves to — see the first signature above for the whole
 * contract, the example and `TProps`.
 *
 * This arm installs on the **Dataset**: `new Dataset({ entries, plugins: [acmeLocks()] })`. A `data`
 * half declares what shapes the Dataset's own construction, and a Dataset installs its plugins once,
 * so `GanttOptions.plugins` refuses it, in the editor rather than at mount. It may fill `view` as
 * well, and every Gantt bound to that Dataset then runs `view` once with its own context.
 */
export function definePlugin<TProps = unknown, TPlugin extends DataPlugin<TProps> = DataPlugin<TProps>>(
  plugin: TPlugin,
): TPlugin;
export function definePlugin<TProps>(
  plugin: ChromePlugin<TProps> | DataPlugin<TProps>,
): ChromePlugin<TProps> | DataPlugin<TProps> {
  return plugin;
}
