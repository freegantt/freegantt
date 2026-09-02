import './harness-nav.ts';
import { Gantt, Dataset } from '../src/api/index.js';
import type { GanttPlugin } from '../src/api/index.js';
import { sampleEntries } from '../fixtures/sample-dataset.js';

const dataset = new Dataset({ entries: sampleEntries, timeZone: 'UTC' });
const gantt = new Gantt({ container: '#gantt', dataset });
gantt.panToToday();

const log = document.querySelector<HTMLDivElement>('#log')!;
const toggleBtn = document.querySelector<HTMLButtonElement>('#toggle-plugin-btn')!;

function writeLog(line: string): void {
  const entry = document.createElement('div');
  entry.textContent = line;
  log.prepend(entry);
}

// The two-line logging plugin the S5.1 acceptance box asks for (README §3, D-S5-1): a value the
// harness imports, installed and removed live through `gantt.plugins` — no private import, no
// remount.
function logEverything(): GanttPlugin {
  return {
    id: 'harness.logEverything',
    setup(ctx) {
      const onSelectionChange = (): void =>
        writeLog(`selectionChange: ${ctx.gantt.selection.length} selected`);
      ctx.events.on('selectionChange', onSelectionChange);
      writeLog('logEverything: installed');
      return () => {
        ctx.events.off('selectionChange', onSelectionChange);
        writeLog('logEverything: disposed');
      };
    },
  };
}

toggleBtn.addEventListener('click', () => {
  const installed = gantt.plugins.some((plugin) => plugin.id === 'harness.logEverything');
  if (installed) {
    gantt.plugins = gantt.plugins.filter((plugin) => plugin.id !== 'harness.logEverything');
    toggleBtn.textContent = 'Install logging plugin';
  } else {
    gantt.plugins = [...gantt.plugins, logEverything()];
    toggleBtn.textContent = 'Remove logging plugin';
  }
});

// S5.2, D-S5-6/D-S5-7: a plugin registers its own command and binds a chord to it — `Mod+K` clears
// the selection, through the same `ctx.commands.register`/`ctx.interaction.registerKeybinding` seam
// every built-in feature uses (no back door). Installed from the start, alongside `logEverything`.
function selectionShortcuts(): GanttPlugin {
  return {
    id: 'harness.selectionShortcuts',
    setup(ctx) {
      ctx.commands.register({
        id: 'demo.clearSelection',
        label: 'Clear selection (demo)',
        run: () => {
          ctx.gantt.selection = [];
          writeLog('demo.clearSelection: selection cleared (Mod+K)');
        },
      });
      ctx.interaction.registerKeybinding({ chord: 'Mod+K', command: 'demo.clearSelection' });
      return () => {};
    },
  };
}

gantt.plugins = [...gantt.plugins, selectionShortcuts()];
