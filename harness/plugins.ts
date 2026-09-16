import './harness-nav.ts';
import { Gantt, Dataset, contextMenu, diamond, timeShading, daysOfWeek } from 'freegantt';
import type { GridCellRenderer, ChromePlugin, EntryVariant } from 'freegantt';
import { sampleEntries } from '../fixtures/sample-dataset.js';
import { overBudgetRows } from './plugins/over-budget-rows.js';
import { bufferKind } from './plugins/buffer-kind.js';
import { riskKind } from './plugins/risk-kind.js';
import { logEverything } from './plugins/log-everything.js';
import { selectionShortcuts } from './plugins/selection-shortcuts.js';
import { popupDemo } from './plugins/popup-demo.js';
import { mountPageBrief } from './docs/page-brief.js';

// D-S5-29: what this page demonstrates, the config that does it, and the spec section that governs it.
mountPageBrief(document.querySelector<HTMLDivElement>('#page-brief')!, 'plugins');

// S5.4's visible-acceptance box (s5.4-renderers.md §4, D-S5-10/11/12): a milestone diamond and a
// red over-budget cost cell, painted through `barRenderer`/`gridCellRenderer` alone — no bespoke
// paint path — with a toggle that switches both off live, no remount.
const BUDGET_THRESHOLD = 1000;
// Adjacent rows and adjacent days (`fixtures/sample-dataset.ts`) — one `reveal()` below brings
// both into view together, no scrolling needed to see the acceptance box's two renderers at once.
const MILESTONE_ENTRY_ID = 'entry-39'; // "Launch" — already a single-day span, a natural milestone.
const OVER_BUDGET_ENTRY_ID = 'entry-38'; // "Go/no-go review" — given a cost above the threshold below.
const BUFFER_ENTRY_ID = 'entry-37'; // [S5-A3]: recast as bufferKind()'s own variant, below.
const RISK_ENTRY_ID = 'entry-36'; // Review P2: recast as riskKind()'s own variant, the second one.

const dataset = new Dataset({
  timeZone: 'UTC',
  fieldTypes: {
    money: {
      rollUp: 'sum',
      formatValue: (value) => (typeof value === 'number' ? `$${value}` : ''),
      column: { header: 'Cost', align: 'end' },
    },
  },
  // `consumed`/`accepted` back the two variant plugins' own commands below — a chrome plugin installs
  // after the Dataset's own registration closes, so it cannot declare a Field of its own; this
  // Dataset must (ADR 0011: an undeclared key is refused at `entries.update()`).
  //
  // ADR 0018: `buffer`/`risk`/`milestone` are this page's own words for three rows. Each plugin's
  // variant rule reads its own key back, so no plugin holds a list of the ids it owns, and
  // `update(id, { buffer: true })` would recast a fourth row with no code change.
  fields: [
    { key: 'cost', type: 'money' },
    { key: 'consumed' },
    { key: 'accepted' },
    { key: 'buffer' },
    { key: 'risk' },
    { key: 'milestone' },
  ],
  entries: sampleEntries.map((entry) => {
    const input = entry.toInput();
    if (entry.id === OVER_BUDGET_ENTRY_ID) return { ...input, props: { cost: 1500 } };
    if (entry.id === BUFFER_ENTRY_ID) return { ...input, props: { buffer: true } };
    if (entry.id === RISK_ENTRY_ID) return { ...input, props: { risk: true } };
    if (entry.id === MILESTONE_ENTRY_ID) return { ...input, props: { milestone: true } };
    return input;
  }),
});
const gantt = new Gantt({ container: '#gantt', dataset, gridColumns: ['name', 'cost'] });
gantt.reveal(MILESTONE_ENTRY_ID);

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

// S5.2/S5.3, D-S5-6/D-S5-7/D-S5-8: both demos live in `harness/plugins/`, beside `overBudgetRows()`
// and the two variant plugins, so this page and `main.ts` install one copy each instead of holding two
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

// S5.4, D-S5-10/11/12: `barRenderer`/`gridCellRenderer` are `GanttOptions.*` — the consumer's own,
// level 3 of the ladder (D-S5-11) — so setting them here needs no plugin at all. The cell renderer
// below branches on `ctx.fieldValue`, the `cost` Field's own value (review H3), and paints
// `ctx.value`, the string the library formatted from it. Neither half reaches into `entry.props`:
// the whole point of a declared Field is that a consumer reads it by name, not by storage key.

// ADR 0022: `diamond()` is core's own shipped glyph, so this page states only which rows wear one.
// The purple fill is an ordinary rule in this page's own `<style>` block
// (`.fg-bar-diamond { --fg-bar-fill: … }`), no JavaScript in between (refuted item 8) — `.fg-bar`
// already reads that token into `--fg-bar-fill-painted`, and `diamond()`'s own `::before` paints
// from it. `buffer` and `risk` stay hand-written: core ships neither look, and naming them here too
// demonstrates that a consumer's own variant wins over a plugin's of the same name whatever order
// the plugins installed in (D-S5-11). Uncheck this toggle to see both plugin variants take over
// instead — same pixels, two different sources, and neither plugin refuses the other (review P2).
// `name: 'milestone'` (F10) tells ADR 0018's own story here too, the same as `buffer` and `risk`
// below — an app names a row in its own word, and `diamond()`'s look reads none of them.
const demoVariants: readonly EntryVariant[] = [
  diamond({ name: 'milestone', when: { milestone: true } }),
  { name: 'buffer', when: { buffer: true }, paint: () => ({ class: { 'demo-buffer-bar': true } }) },
  { name: 'risk', when: { risk: true }, paint: () => ({ class: { 'demo-risk-bar': true } }) },
];
const demoGridCellRenderer: GridCellRenderer = ({ column, value, fieldValue }) =>
  column.field === 'cost' && typeof fieldValue === 'number' && fieldValue > BUDGET_THRESHOLD
    ? { class: { 'demo-over-budget': true }, text: value }
    : undefined;

const renderersToggle = document.querySelector<HTMLInputElement>('#renderers-toggle')!;
renderersToggle.addEventListener('change', () => {
  if (renderersToggle.checked) {
    gantt.variants = demoVariants;
    gantt.gridCellRenderer = demoGridCellRenderer;
    writeLog('renderers demo: custom milestone diamond + over-budget cost cell on');
  } else {
    gantt.variants = [];
    gantt.gridCellRenderer = undefined;
    writeLog('renderers demo: back to the library default, no remount (I8)');
  }
});
renderersToggle.dispatchEvent(new Event('change'));

// #404: timeShading() is the shipped built-in — 'freegantt' alone, no harness plugin behind it, and
// no page CSS (--fg-time-shading-fill covers the paint). Installed from the start; the checkbox
// removes it live through the same `uninstallPlugin` verb every other plugin toggle on this page
// already uses (I8: no remount).
gantt.installPlugin(timeShading([{ covers: daysOfWeek(6, 7), class: 'weekend' }]));

const weekendToggle = document.querySelector<HTMLInputElement>('#weekend-shading-toggle')!;
weekendToggle.addEventListener('change', () => {
  if (weekendToggle.checked) {
    gantt.installPlugin(timeShading([{ covers: daysOfWeek(6, 7), class: 'weekend' }]));
    writeLog('timeShading: installed');
  } else {
    gantt.uninstallPlugin('freegantt.timeShading');
    writeLog('timeShading: removed');
  }
});

// S5.6, D-S5-15/D-S5-16, [S5-A2]: overBudgetRows() is written against the public surface alone
// ('freegantt', harness/plugins/over-budget-rows.ts) — no core edit, no private import. Dogfoods the
// `rowStripe` half of `DecorationInput`, beside `timeShading()`'s own `rangeBand` above. Installed
// from the start; the checkbox removes it live through the same `uninstallPlugin` verb.
gantt.installPlugin(overBudgetRows(BUDGET_THRESHOLD));

const overBudgetRowsToggle = document.querySelector<HTMLInputElement>('#over-budget-rows-toggle')!;
overBudgetRowsToggle.addEventListener('change', () => {
  if (overBudgetRowsToggle.checked) {
    gantt.installPlugin(overBudgetRows(BUDGET_THRESHOLD));
    writeLog('overBudgetRows: installed');
  } else {
    gantt.uninstallPlugin('demo.overBudgetRows');
    writeLog('overBudgetRows: removed');
  }
});

// S5.9, D-S5-21/D-S5-22, [S5-A3]: bufferKind() is written against the public surface alone
// ('freegantt', harness/plugins/buffer-kind.ts) — no core edit, no private import. Review P2:
// riskKind() is a second plugin that defines a second variant, and both install — two rules that
// claim different rows never collide. contextMenu() installs alongside them so each
// plugin's own menu item is reachable by right-click. Installed from the start; the checkbox
// removes all three live, one `uninstallPlugin` per plugin, the same verbs every other plugin
// toggle on this page already uses (I8: no remount).
//
// The page keeps what it installed, so it names those values back to `uninstallPlugin` and guesses
// no plugin id — `contextMenu()`'s least of all, because that id belongs to the library.
let kindPlugins: readonly ChromePlugin[] = [];

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

// Review P2: dropping one variant plugin must leave the other painting. This button drops riskKind()
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
