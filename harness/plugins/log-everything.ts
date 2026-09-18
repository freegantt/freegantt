// harness/plugins/ — written as if by a third party: everything below comes from 'freegantt', the
// package's own public entry, never a path inside 'freegantt/src' (S5.6, [S5-A2]).

import { definePlugin } from 'freegantt';
import type { WriteLog } from './write-log.js';

/** The two-line logging plugin the S5.1 acceptance box asks for (README §3, D-S5-1). A page
 *  installs and removes it live through `gantt.plugins` — no private import, and no remount. It owns
 *  a real disposer, because it holds a subscription `ctx.disposables` knows nothing about. */
export function logEverything(writeLog: WriteLog) {
  return definePlugin({
    id: 'harness.logEverything',
    view(ctx) {
      const onSelectionChange = (): void =>
        writeLog(`selectionChange: ${ctx.gantt.selectedEntryIds.length} selected`);
      ctx.events.on('selectionChange', onSelectionChange);
      writeLog('logEverything: installed');
      return () => {
        ctx.events.off('selectionChange', onSelectionChange);
        writeLog('logEverything: disposed');
      };
    },
  });
}
