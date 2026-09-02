import './harness-nav.ts';
import { Gantt, Dataset, createPopup, itemId } from '../src/api/index.js';
import type { GanttPlugin, Popup } from '../src/api/index.js';
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

// S5.3, D-S5-8: a plugin's `setup()` is the only place `ctx.view.overlay` reaches this scope — stash
// it once, live for the plugin's whole lifetime, so the button below can build a `Popup` from it.
let overlayPopup: Popup | undefined;
function popupDemo(): GanttPlugin {
  return {
    id: 'harness.popupDemo',
    setup(ctx) {
      overlayPopup = createPopup(ctx.view.overlay);
      return () => {
        overlayPopup = undefined;
      };
    },
  };
}
gantt.plugins = [...gantt.plugins, popupDemo()];

const popupBtn = document.querySelector<HTMLButtonElement>('#open-popup-btn')!;
popupBtn.addEventListener('click', () => {
  const selected = gantt.selection[0];
  if (selected === undefined) {
    writeLog('popup demo: select a bar first');
    return;
  }
  const anchor = document.querySelector<HTMLElement>(`#gantt .fg-bar[data-item-id="${itemId(selected)}"]`);
  if (!anchor || !overlayPopup) return;
  overlayPopup.open({
    anchor,
    placement: 'end',
    dismissOn: ['escape', 'outsidePointer', 'scroll'],
    content: {
      style: { padding: '6px 10px', font: 'inherit' },
      text: `Entry: ${selected}`,
    },
  });
  writeLog(`popup demo: opened on ${selected}`);
});
