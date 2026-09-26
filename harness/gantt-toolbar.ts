// The toolbar a consumer would ship — the controls that stay on by default in a real app, over the
// plain public surface (plans/02). It replaces `timeline-toolbar.ts`'s zoom-only strip.
//
// Two rules shape the whole file.
//
// Every action here is `gantt.commands.run(id)`, never a second implementation. Undo, redo, expand
// all, collapse all, zoom and Today are all registered core commands with default keybindings, so a
// button that called `gantt.undo()` directly would drift from the keystroke that does the same job
// (a pointer affordance and its command are one implementation, two entry points). Where
// the control sets a value rather than performing an act — preset, snap — it writes the
// published property, because those are configuration, not commands.
//
// The strip carries no state of its own. Enabled-ness and current values are read back off the
// `Gantt` and its `Dataset` in `refresh()`, which the library's own events drive. A toolbar that
// cached "can undo" would be a second source of truth for something the Dataset already answers.

import type { Gantt, SnapSetting, TimeSpan } from 'freegantt';
import { diffMs, formatDate, formatEndInclusive, isTimeUnit, MS, overlap } from 'freegantt';

export interface GanttToolbarOptions {
  gantt: Gantt;
  container: HTMLElement;
  /** Include the snap picker. Default `true`. */
  showSnap?: boolean;
}

// Preset ids are API identifiers (`dayWeekMonth`); a picker shows people words. The map is
// presentation, so it lives here and not beside the presets themselves.
const PRESET_LABELS: Readonly<Record<string, string>> = {
  hour: 'Hour',
  day: 'Day',
  week: 'Week',
  month: 'Month',
  year: 'Year',
  dayAndWeek: 'Day / Week',
  weekAndMonth: 'Week / Month',
  monthAndYear: 'Month / Year',
  hourDayWeek: 'Hour / Day / Week',
  dayWeekMonth: 'Day / Week / Month',
  weekMonthYear: 'Week / Month / Year',
  // #489, #101: the shipped `sixHour` preset (item 1), a page splices into `gantt.zoomPresets` — the
  // visible proof that a stepped Tick is anchored on the calendar (`time/zone.ts`'s
  // `tickFloor`/`nextTick`), not on wherever the visible window's own left edge happens to sit.
  sixHour: 'Every 6 hours',
};

const SNAP_CHOICES: readonly { readonly value: string; readonly label: string }[] = [
  { value: 'tick', label: 'Tick' },
  { value: 'none', label: 'Off' },
  { value: 'hour', label: 'Hour' },
  // #489: a custom, stepped increment — the same anchoring the "Every 6 hours" preset above draws,
  // read here through the public `{ unit, increment }` snap surface alone.
  { value: 'sixHour', label: 'Every 6 hours' },
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
];

function group(...children: readonly HTMLElement[]): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'toolbar-group';
  el.append(...children);
  return el;
}

/** A labelled button. `hint` names the keystroke that runs the same command, so the strip teaches
 *  the shortcut rather than hiding it. */
function button(label: string, hint: string): HTMLButtonElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.textContent = label;
  el.title = `${label} (${hint})`;
  return el;
}

/** A glyph-only button. The glyph is decoration to a screen reader, so the words live on
 *  `aria-label` and the keystroke on `title`. */
function iconButton(glyph: string, label: string, hint: string): HTMLButtonElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'icon';
  el.textContent = glyph;
  el.setAttribute('aria-label', label);
  el.title = `${label} (${hint})`;
  return el;
}

function select(ariaLabel: string): HTMLSelectElement {
  const el = document.createElement('select');
  el.setAttribute('aria-label', ariaLabel);
  return el;
}

function option(value: string, label: string): HTMLOptionElement {
  const el = document.createElement('option');
  el.value = value;
  el.textContent = label;
  return el;
}

/** Builds the toolbar and binds it to the `Gantt`. Every button runs a registered command; the
 *  pickers write published properties. */
export function mountGanttToolbar(options: GanttToolbarOptions): void {
  const { gantt, container, showSnap = true } = options;
  // #226: the Dataset comes off the Gantt that already holds it, so the page cannot hand this
  // toolbar a Gantt and a Dataset that do not belong to each other.
  const dataset = gantt.dataset;

  const bar = document.createElement('div');
  bar.className = 'toolbar';
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', 'Gantt controls');

  // What can be taken back?
  const undoBtn = iconButton('↶', 'Undo', 'Mod+Z');
  const redoBtn = iconButton('↷', 'Redo', 'Mod+Shift+Z');

  // How much of the tree is showing?
  const collapseBtn = button('Collapse all', 'Mod+Shift+[');
  const expandBtn = button('Expand all', 'Mod+Shift+]');

  // How much time fits on screen? The two steppers and the preset are one measure, so they share
  // one box rather than sitting apart on the strip.
  const zoomOutBtn = iconButton('−', 'Zoom out', 'Mod+-');
  const zoomInBtn = iconButton('+', 'Zoom in', 'Mod+=');
  const presetSelect = select('Time scale');
  for (const preset of gantt.zoomPresets) {
    presetSelect.append(option(preset.id, PRESET_LABELS[preset.id] ?? preset.id));
  }
  const zoomMeasure = document.createElement('div');
  zoomMeasure.className = 'zoom-measure';
  zoomMeasure.append(zoomOutBtn, presetSelect, zoomInBtn);

  // Where is now?
  const todayBtn = button('Today', 'Mod+Home');

  // What time span is on screen? `gantt.visibleSpan` (issue #461) — the window, never `range`'s
  // content extent — read fresh on every `navigationChange`, which already fires on pan, zoom and
  // preset change alike (one Viewport Batch, S1.12).
  const spanReadout = document.createElement('span');
  spanReadout.className = 'toolbar-readout';

  // How much of the dataset falls inside that window? Every entry counts, including one scrolled
  // above or below the pane — only the horizontal window filters (issue #472). `overlap()` clips
  // each leaf's span to `visibleSpan`; a row that pokes half out of the window on one side counts
  // half its own duration, so this is a window total, not a per-row read.
  const hoursReadout = document.createElement('span');
  hoursReadout.className = 'toolbar-readout';

  bar.append(
    group(undoBtn, redoBtn),
    group(collapseBtn, expandBtn),
    group(zoomMeasure),
    group(todayBtn),
    group(spanReadout, hoursReadout),
  );

  // What do dragged edges land on?
  let snapSelect: HTMLSelectElement | undefined;
  if (showSnap) {
    snapSelect = select('Snap');
    for (const choice of SNAP_CHOICES) snapSelect.append(option(choice.value, choice.label));
    const field = document.createElement('label');
    field.className = 'toolbar-field';
    field.append('Snap', snapSelect);
    bar.append(group(field));
  }

  container.append(bar);

  // A custom `SnapRule` function names no picker option — leave the select at whatever it already
  // shows rather than guessing (`refresh()` below only writes when this answers a value).
  function snapValue(setting: SnapSetting): string | undefined {
    if (typeof setting === 'function') return undefined;
    if (typeof setting === 'string') return setting;
    if (setting.unit === 'hour' && setting.increment === 6) return 'sixHour';
    return setting.unit;
  }

  function readSnapChoice(value: string): SnapSetting {
    if (value === 'tick' || value === 'none') return value;
    if (value === 'sixHour') return { unit: 'hour', increment: 6 };
    return isTimeUnit(value) ? { unit: value, increment: 1 } : 'tick';
  }

  // The window total the readout shows. Walks every leaf — a row with children already rolls its
  // children's values up onto itself (#270), so counting the parent too would double the hours.
  function visibleHours(span: TimeSpan): number {
    let hours = 0;
    for (const entry of dataset.entries.all) {
      if (entry.start === undefined || entry.end === undefined) continue;
      if (entry.hasChildren) continue;
      const visible = overlap({ start: entry.start, end: entry.end }, span);
      if (visible === undefined) continue;
      hours += diffMs(visible.end, visible.start) / MS.HOUR;
    }
    return hours;
  }

  // One place reads the live state back. Nothing here is cached; every value comes off the Gantt or
  // the Dataset that owns it.
  function refresh(): void {
    undoBtn.disabled = !dataset.canUndo;
    redoBtn.disabled = !dataset.canRedo;
    zoomOutBtn.disabled = !gantt.canZoomOut;
    zoomInBtn.disabled = !gantt.canZoomIn;
    presetSelect.value = gantt.preset.id;
    const snapReadout = snapValue(gantt.snap);
    if (snapSelect && snapReadout !== undefined) snapSelect.value = snapReadout;
    const span = gantt.visibleSpan;
    const zone = dataset.timeZone;
    spanReadout.textContent = `Showing ${formatDate(span.start, { timeZone: zone })} – ${formatEndInclusive(zone, span)}`;
    hoursReadout.textContent = `Visible hours: ${Math.round(visibleHours(span))}`;
  }

  undoBtn.addEventListener('click', () => gantt.commands.run('freegantt.undo'));
  redoBtn.addEventListener('click', () => gantt.commands.run('freegantt.redo'));
  collapseBtn.addEventListener('click', () => gantt.commands.run('freegantt.collapseAll'));
  expandBtn.addEventListener('click', () => gantt.commands.run('freegantt.expandAll'));
  zoomOutBtn.addEventListener('click', () => gantt.commands.run('freegantt.zoomOut'));
  zoomInBtn.addEventListener('click', () => gantt.commands.run('freegantt.zoomIn'));
  todayBtn.addEventListener('click', () => gantt.commands.run('freegantt.panToToday'));

  presetSelect.addEventListener('change', () => {
    gantt.preset = presetSelect.value;
  });
  snapSelect?.addEventListener('change', () => {
    gantt.snap = readSnapChoice(snapSelect!.value);
  });

  gantt.on('navigationChange', refresh);
  dataset.on('change', refresh);
  dataset.on('historyChange', refresh);

  refresh();
}
