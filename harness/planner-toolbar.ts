// The planner page's own two-row toolbar (DESIGN-FACTS §5, design source ~line 90-135). Its shape
// is bespoke to this page — the other demo pages share `gantt-toolbar.ts` — but its actions are not:
// every button below is `gantt.commands.run(id)`, the same registered command `gantt-toolbar.ts`
// runs, and the zoom picker writes the same published property (`gantt.preset`). A control that recomputed what the library already does would be the defect
// this whole branch exists to avoid.
//
// Two exceptions state their own reasoning at the call site: `+ New task` (design draws the button,
// the behaviour is undecided — same posture `planner.ts` already took) and `reset` (composes
// existing commands and properties into one gesture, see `resetToOpeningState`). The design's THEME
// segment lives in the page header instead (`page-theme.ts`), because the theme paints the whole
// page, not only this toolbar.

import type { Gantt, ShippedPresetId, TimeSpan } from 'freegantt';
import { formatDate, formatEndInclusive } from 'freegantt';

export interface PlannerToolbarOptions {
  gantt: Gantt;
  container: HTMLElement;
  /** The design's own project name and window (row 1, left) — page-supplied display text, not
   *  data the library has an opinion about. */
  projectName: string;
  projectSpan: TimeSpan;
  onNewTask: () => void;
  onReset: () => void;
}

export interface PlannerToolbar {
  /** Row 2's right-aligned monospace status line (DESIGN-FACTS §5) — `planner.ts` owns what it
   *  says, this module only owns where it sits. */
  readonly readout: HTMLSpanElement;
}

// Day / Week / Month is the design's own three-state zoom (line 555). Each name is a published
// preset id (`time/presets.ts`) that already renders two header bands the way the design always
// does (month band above, a finer band below) — `dayAndWeek`/`weekAndMonth`/`monthAndYear` keep
// that shape at three granularities instead of dropping to a single band.
const ZOOM_PRESETS: readonly { readonly value: ShippedPresetId; readonly label: string }[] = [
  { value: 'dayAndWeek', label: 'Day' },
  { value: 'weekAndMonth', label: 'Week' },
  { value: 'monthAndYear', label: 'Month' },
];

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** A segmented control: one group of exclusive buttons sharing a track (design lines 119-123). */
function segmented<T extends string>(
  ariaLabel: string,
  choices: readonly { readonly value: T; readonly label: string }[],
  onPick: (value: T) => void,
): { readonly root: HTMLDivElement; readonly setActive: (value: T) => void } {
  const root = el('div', 'demo-segmented');
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', ariaLabel);
  const buttons = choices.map(({ value, label }) => {
    const button = el('button', 'demo-segmented-btn', label);
    button.type = 'button';
    button.addEventListener('click', () => onPick(value));
    root.append(button);
    return { value, button };
  });
  const setActive = (active: T): void => {
    for (const { value, button } of buttons) button.setAttribute('aria-pressed', String(value === active));
  };
  return { root, setActive };
}

function separator(): HTMLSpanElement {
  return el('span', 'demo-toolbar-sep');
}

/** Builds the toolbar and binds it to the `Gantt`. Every button runs a registered command; the zoom
 *  picker writes a published property (`gantt.preset`). */
export function mountPlannerToolbar(options: PlannerToolbarOptions): PlannerToolbar {
  const { gantt, container, projectName, projectSpan, onNewTask, onReset } = options;
  const zone = gantt.dataset.timeZone;

  // ---- Row 1: title + date range, reset -----------------------------------------------
  const row1 = el('div', 'demo-toolbar-row');
  const titleGroup = el('div', 'demo-toolbar-title-group');
  titleGroup.append(
    el('span', 'demo-toolbar-title', projectName),
    el(
      'span',
      'demo-toolbar-subtitle',
      `${formatDate(projectSpan.start, { timeZone: zone }, { month: 'short', day: 'numeric' })} – ${formatEndInclusive(zone, projectSpan, undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`,
    ),
  );
  row1.append(titleGroup, el('div', 'demo-toolbar-spacer'));

  const resetBtn = el('button', 'demo-reset-btn', 'reset');
  resetBtn.type = 'button';
  resetBtn.addEventListener('click', onReset);
  row1.append(resetBtn);

  // ---- Row 2: new task, undo/redo, zoom, today, readout ---------------------------------------
  const row2 = el('div', 'demo-toolbar-row');
  const newTaskBtn = el('button', 'demo-new-task-btn');
  newTaskBtn.type = 'button';
  // The `+` reads as part of the label, not a decoration — `aria-hidden` would drop it from the
  // accessible name and leave a screen reader announcing a bare "New task" button.
  newTaskBtn.innerHTML = '<span>+</span> New task';
  newTaskBtn.addEventListener('click', onNewTask);

  const undoBtn = el('button', 'demo-icon-btn', '↺');
  undoBtn.type = 'button';
  undoBtn.title = 'Undo (Mod+Z)';
  undoBtn.setAttribute('aria-label', 'Undo');
  undoBtn.addEventListener('click', () => gantt.commands.run('freegantt.undo'));

  const redoBtn = el('button', 'demo-icon-btn', '↻');
  redoBtn.type = 'button';
  redoBtn.title = 'Redo (Mod+Shift+Z)';
  redoBtn.setAttribute('aria-label', 'Redo');
  redoBtn.addEventListener('click', () => gantt.commands.run('freegantt.redo'));

  const zoomOutBtn = el('button', 'demo-icon-btn', '−');
  zoomOutBtn.type = 'button';
  zoomOutBtn.title = 'Zoom out (Mod+-)';
  zoomOutBtn.setAttribute('aria-label', 'Zoom out');
  zoomOutBtn.addEventListener('click', () => gantt.commands.run('freegantt.zoomOut'));

  const zoomInBtn = el('button', 'demo-icon-btn', '+');
  zoomInBtn.type = 'button';
  zoomInBtn.title = 'Zoom in (Mod+=)';
  zoomInBtn.setAttribute('aria-label', 'Zoom in');
  zoomInBtn.addEventListener('click', () => gantt.commands.run('freegantt.zoomIn'));

  const zoom = segmented('Time scale', ZOOM_PRESETS, (preset) => {
    gantt.preset = preset;
  });

  const todayBtn = el('button', 'demo-today-btn');
  todayBtn.type = 'button';
  todayBtn.innerHTML = '<span class="demo-today-dot" aria-hidden="true"></span>Today';
  todayBtn.addEventListener('click', () => gantt.commands.run('freegantt.panToToday'));

  const readout = el('span', 'demo-toolbar-readout');
  readout.setAttribute('role', 'status');

  row2.append(
    newTaskBtn,
    separator(),
    undoBtn,
    redoBtn,
    separator(),
    zoomOutBtn,
    zoom.root,
    zoomInBtn,
    separator(),
    todayBtn,
    el('div', 'demo-toolbar-spacer'),
    readout,
  );

  container.append(row1, row2);

  // One place reads the live state back — nothing here is cached.
  function refresh(): void {
    undoBtn.disabled = !gantt.dataset.canUndo;
    redoBtn.disabled = !gantt.dataset.canRedo;
    zoomOutBtn.disabled = !gantt.canZoomOut;
    zoomInBtn.disabled = !gantt.canZoomIn;
    zoom.setActive(gantt.preset.id as ShippedPresetId);
  }

  gantt.on('navigationChange', refresh);
  gantt.dataset.on('change', refresh);
  gantt.dataset.on('historyChange', refresh);

  refresh();

  return { readout };
}
