import './harness-nav.ts';
import { Gantt, Dataset, entryId, contextMenu } from '../src/api/index.js';
import type { RendererByKind, CellRenderer, GanttPlugin } from '../src/api/index.js';
import { sampleEntries } from '../fixtures/sample-dataset.js';
import { weekendShading } from './plugins/weekend-shading.js';
import { bufferKind } from './plugins/buffer-kind.js';
import { riskKind } from './plugins/risk-kind.js';
import { logEverything } from './plugins/log-everything.js';
import { selectionShortcuts } from './plugins/selection-shortcuts.js';
import { popupDemo } from './plugins/popup-demo.js';
import { mountPageBrief } from './docs/page-brief.js';

// D-S5-29: what this page demonstrates, the config that does it, and the spec section that governs it.
mountPageBrief(document.querySelector<HTMLDivElement>('#page-brief')!, 'plugins');

// S5.4's visible-acceptance box (s5.4-renderers.md §4, D-S5-10/11/12): a milestone diamond and a
// red over-budget cost cell, painted through `barRenderer`/`cellRenderer` alone — no bespoke
// paint path — with a toggle that switches both off live, no remount.
const BUDGET_THRESHOLD = 1000;
// Adjacent rows and adjacent days (`fixtures/sample-dataset.ts`) — one `reveal()` below brings
// both into view together, no scrolling needed to see the acceptance box's two renderers at once.
const MILESTONE_ENTRY_ID = 'entry-39'; // "Launch" — already a single-day span, a natural milestone.
const OVER_BUDGET_ENTRY_ID = 'entry-38'; // "Go/no-go review" — given a cost above the threshold below.
const BUFFER_ENTRY_ID = 'entry-37'; // [S5-A3]: recast as bufferKind()'s own kind, below.
const RISK_ENTRY_ID = 'entry-36'; // Review P2: recast as riskKind()'s own kind, the second one.

const dataset = new Dataset({
  timeZone: 'UTC',
  fieldTypes: {
    money: {
      rollUp: 'sum',
      formatValue: (value) => (typeof value === 'number' ? `$${value}` : ''),
      column: { header: 'Cost', align: 'end' },
    },
  },
  fields: [{ key: 'cost', type: 'money' }],
  entries: sampleEntries.map((entry) => {
    if (entry.id === MILESTONE_ENTRY_ID) return { ...entry, kind: 'milestone' as const };
    if (entry.id === OVER_BUDGET_ENTRY_ID) return { ...entry, meta: { cost: 1500 } };
    if (entry.id === BUFFER_ENTRY_ID) return { ...entry, kind: 'buffer' };
    if (entry.id === RISK_ENTRY_ID) return { ...entry, kind: 'risk' };
    return entry;
  }),
});
const gantt = new Gantt({ container: '#gantt', dataset, gridColumns: ['name', 'cost'] });
gantt.reveal(entryId(MILESTONE_ENTRY_ID));

const log = document.querySelector<HTMLDivElement>('#log')!;
const toggleBtn = document.querySelector<HTMLButtonElement>('#toggle-plugin-btn')!;

function writeLog(line: string): void {
  const entry = document.createElement('div');
  entry.textContent = line;
  log.prepend(entry);
}

// D-S5-36: one verb per plugin, so the page never restates the installed set to change one of them.
// `hasPlugin` is what a toggle reads before it decides which verb to call.
toggleBtn.addEventListener('click', () => {
  if (gantt.hasPlugin('harness.logEverything')) {
    gantt.uninstallPlugin('harness.logEverything');
    toggleBtn.textContent = 'Install logging plugin';
  } else {
    gantt.installPlugin(logEverything(writeLog));
    toggleBtn.textContent = 'Remove logging plugin';
  }
});

// S5.2/S5.3, D-S5-6/D-S5-7/D-S5-8: both demos live in `harness/plugins/`, beside `weekendShading()`
// and the two kind plugins, so this page and `main.ts` install one copy each instead of holding two
// (review H1). Both are written against 'freegantt' alone, like every other file in that directory.
// #178: the page keeps the plugin object, the same way it keeps `lockEntries()`'s. That handle is
// how page scope reaches what the plugin built in `setup()` — it replaces a module-level stash the
// plugin used to keep for its callers, which two Gantts on one page would have shared (I2).
const demoPopup = popupDemo();
gantt.installPlugin(selectionShortcuts(writeLog));
gantt.installPlugin(demoPopup);

const popupBtn = document.querySelector<HTMLButtonElement>('#open-popup-btn')!;
popupBtn.addEventListener('click', () => {
  const selected = gantt.selectedEntryIds[0];
  if (selected === undefined) {
    writeLog('popup demo: select a bar first');
    return;
  }
  if (demoPopup.openOn(selected)) writeLog(`popup demo: opened on ${selected}`);
});

// S5.4, D-S5-10/11/12: `barRenderer`/`cellRenderer` are `GanttOptions.*` — the consumer's own,
// level 3 of the ladder (D-S5-11) — so setting them here needs no plugin at all. The cell renderer
// below branches on `ctx.fieldValue`, the `cost` Field's own value (review H3), and paints
// `ctx.value`, the string the library formatted from it. Neither half reaches into `entry.meta`:
// ADR 0005's whole point is that a consumer reads a Field, not a storage key.

// `fg-bar-diamond`'s own shape is structural, from `entry.kind` alone (D-S4-24), outside a
// renderer's bounded scope (attr/class/style/text/children, I13) — it stays applied underneath
// whatever a `barRenderer` paints. Its `::before` reads the `--fg-bar-fill` custom property, which
// inherits from this bar node, so recoloring the diamond (rather than fighting its shape) is what a
// `style` write actually reaches; `demo-milestone`'s own class carries the rest (the label below).
// S5.9: `buffer` and `risk` paint the same classes their own plugins register
// (harness/plugins/buffer-kind.ts, harness/plugins/risk-kind.ts) — named here too because a
// consumer's own per-kind map wins over a plugin for every kind it names, and falls to the library
// default for every kind it misses (D-S5-11). Uncheck this toggle to see both plugin registrations
// take over instead — same pixels, two different sources, and neither plugin refuses the other
// (review P2).
const demoBarRenderer: RendererByKind = {
  milestone: () => ({
    class: { 'demo-milestone': true },
    style: { '--fg-bar-fill': '#7b2cbf' },
  }),
  buffer: () => ({ class: { 'demo-buffer-bar': true } }),
  risk: () => ({ class: { 'demo-risk-bar': true } }),
};
const demoCellRenderer: CellRenderer = ({ column, value, fieldValue }) =>
  column.field === 'cost' && typeof fieldValue === 'number' && fieldValue > BUDGET_THRESHOLD
    ? { class: { 'demo-over-budget': true }, text: value }
    : undefined;

const renderersToggle = document.querySelector<HTMLInputElement>('#renderers-toggle')!;
renderersToggle.addEventListener('change', () => {
  if (renderersToggle.checked) {
    gantt.barRenderer = demoBarRenderer;
    gantt.cellRenderer = demoCellRenderer;
    writeLog('renderers demo: custom milestone diamond + over-budget cost cell on');
  } else {
    gantt.barRenderer = undefined;
    gantt.cellRenderer = undefined;
    writeLog('renderers demo: back to the library default, no remount (I8)');
  }
});
renderersToggle.dispatchEvent(new Event('change'));

// S5.6, D-S5-15/D-S5-16, [S5-A2]: weekendShading() is written against the public surface alone
// ('freegantt', harness/plugins/weekend-shading.ts) — no core edit, no private import. Installed
// from the start; the checkbox removes it live through the same `uninstallPlugin` verb every
// other plugin toggle on this page already uses (I8: no remount).
gantt.installPlugin(weekendShading());

const weekendToggle = document.querySelector<HTMLInputElement>('#weekend-shading-toggle')!;
weekendToggle.addEventListener('change', () => {
  if (weekendToggle.checked) {
    gantt.installPlugin(weekendShading());
    writeLog('weekendShading: installed');
  } else {
    gantt.uninstallPlugin('demo.weekendShading');
    writeLog('weekendShading: removed');
  }
});

// S5.9, D-S5-21/D-S5-22, [S5-A3]: bufferKind() is written against the public surface alone
// ('freegantt', harness/plugins/buffer-kind.ts) — no core edit, no private import. Review P2:
// riskKind() is a second plugin that defines a second kind, and both install — the `bar` point
// keys on the kind, so neither refuses the other. contextMenu() installs alongside them so each
// plugin's own menu item is reachable by right-click. Installed from the start; the checkbox
// removes all three live, one `uninstallPlugin` per plugin, the same verbs every other plugin
// toggle on this page already uses (I8: no remount).
//
// The page keeps what it installed, so it names those values back to `uninstallPlugin` and guesses
// no plugin id — `contextMenu()`'s least of all, because that id belongs to the library.
let kindPlugins: readonly GanttPlugin[] = [];

function installKindPlugins(): void {
  kindPlugins = [contextMenu(), bufferKind(), riskKind()];
  for (const plugin of kindPlugins) gantt.installPlugin(plugin);
}

/** `hasPlugin` first: the drop-risk button below can already have removed one of the three, and the
 *  verbs are strict where the assignment form was quiet (D-S5-36). */
function uninstallKindPlugins(): void {
  for (const plugin of kindPlugins) if (gantt.hasPlugin(plugin)) gantt.uninstallPlugin(plugin);
  kindPlugins = [];
}

installKindPlugins();

const kindPluginsToggle = document.querySelector<HTMLInputElement>('#kind-plugins-toggle')!;
kindPluginsToggle.addEventListener('change', () => {
  if (kindPluginsToggle.checked) {
    installKindPlugins();
    writeLog('bufferKind + riskKind: installed');
  } else {
    uninstallKindPlugins();
    writeLog('bufferKind + riskKind: removed');
  }
});

// Review P2: dropping one kind plugin must leave the other painting. This button drops riskKind()
// alone, so the page shows the claim rather than only asserting it in a test.
const dropRiskBtn = document.querySelector<HTMLButtonElement>('#drop-risk-kind-btn')!;
dropRiskBtn.addEventListener('click', () => {
  if (!gantt.hasPlugin('demo.riskKind')) {
    writeLog('riskKind: already removed');
    return;
  }
  gantt.uninstallPlugin('demo.riskKind');
  writeLog('riskKind: removed — bufferKind still paints');
});
