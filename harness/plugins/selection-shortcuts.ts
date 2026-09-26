// harness/plugins/ — written as if by a third party: everything below comes from 'freegantt', the
// package's own public entry, never a path inside 'freegantt/src' (S5.6, [S5-A2]).

import { definePlugin } from 'freegantt';
import type { WriteLog } from './write-log.js';

/** S5.2: a plugin registers its own command and binds a chord to it. `Mod+K` clears
 *  the selection, through the same `ctx.commands.register` and
 *  `ctx.interaction.registerKeybinding` seams every built-in feature uses — no back door. */
export function selectionShortcuts(writeLog: WriteLog) {
  return definePlugin({
    id: 'harness.selectionShortcuts',
    view(ctx) {
      ctx.commands.register({
        id: 'demo.clearSelection',
        label: 'Clear selection (demo)',
        run: () => {
          ctx.gantt.selectedEntryIds = [];
          writeLog('demo.clearSelection: selection cleared (Mod+K)');
        },
      });
      ctx.interaction.registerKeybinding({ chord: 'Mod+K', command: 'demo.clearSelection' });
      // No disposer: `ctx.disposables` already retracts the command and the keybinding (review P4).
    },
  });
}
