// The planner page's own two-row toolbar (DESIGN-FACTS §5, design source ~line 90-135). Its shape
// is bespoke to this page — every other harness page keeps sharing `gantt-toolbar.ts` — but its
// actions are not: every button below is `gantt.commands.run(id)`, the same registered command
// `gantt-toolbar.ts` runs, and every picker writes the same published property (`gantt.theme`,
// `gantt.preset`). A control that recomputed what the library already does would be the defect
// this whole branch exists to avoid.
//
// Three exceptions state their own reasoning at the call site: `+ New task` (design draws the
// button, the behaviour is undecided — same posture `planner.ts` already took), `reset` (composes
// existing commands and properties into one gesture, see `resetToOpeningState`) and `Paper` (a
// consumer-set class, never a `gantt.theme` value — see `planner.ts`).

import type { Gantt, ShippedPresetId, TimeSpan } from '../src/api/index.js';
import { formatDate, formatEndInclusive } from '../src/api/index.js';

export type PlannerThemeChoice = 'light' | 'dark' | 'paper';

export interface PlannerToolbarOptions {
  gantt: Gantt;
  container: HTMLElement;
  /** The design's own project name and window (row 1, left) — page-supplied display text, not
   *  data the library has an opinion about. */
  projectName: string;
  projectSpan: TimeSpan;
  onNewTask: () => void;
  onReset: () => void;
  /** Read back after every `applyTheme` call, so the page can drive its own Paper stylesheet and
   *  persist the choice the way `gantt-toolbar.ts` persists `Theme`. */
  onThemeChange: (choice: PlannerThemeChoice) => void;
  initialTheme: PlannerThemeChoice;
}

export interface PlannerToolbar {
  /** Row 2's right-aligned monospace status line (DESIGN-FACTS §5) — `planner.ts` owns what it
   *  says, this module only owns where it sits. */
  readonly readout: HTMLSpanElement;
  /** Drives the THEME segment the same way a click on it would — `gantt.theme`, the active state,
   *  and `onThemeChange` all move together. `planner.ts`'s own `reset` is the one caller: putting
   *  the view back where it opened means putting the theme control back too. */
  readonly setTheme: (choice: PlannerThemeChoice) => void;
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

const THEME_CHOICES: readonly { readonly value: PlannerThemeChoice; readonly label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'paper', label: 'Paper' },
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

/** A segmented control: one group of exclusive buttons sharing a track. Theme and zoom both use
 *  this shape (design lines 100-104, 119-123), so it is one function, not two. */
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

/** Builds the toolbar and binds it to the `Gantt`. Every button runs a registered command; the
 *  segmented controls write published properties (`gantt.preset`) or call back to the page for the
 *  one value the library never heard of (`Paper`, a consumer class — see `planner.ts`). */
export function mountPlannerToolbar(options: PlannerToolbarOptions): PlannerToolbar {
  const { gantt, container, projectName, projectSpan, onNewTask, onReset, onThemeChange, initialTheme } =
    options;
  const zone = gantt.dataset.timeZone;

  // ---- Row 1: title + date range, theme, reset -----------------------------------------------
  const row1 = el('div', 'demo-toolbar-row');
  const titleGroup = el('div', 'demo-toolbar-title-group');
  titleGroup.append(
    el('span', 'demo-toolbar-title', projectName),
    el(
      'span',
      'demo-toolbar-subtitle',
      `${formatDate(zone, projectSpan.start, undefined, { month: 'short', day: 'numeric' })} – ${formatEndInclusive(zone, projectSpan, undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`,
    ),
  );
  row1.append(titleGroup, el('div', 'demo-toolbar-spacer'));

  const themeLabelGroup = el('div', 'demo-toolbar-theme-group');
  themeLabelGroup.append(el('span', 'demo-toolbar-mono-label', 'THEME'));
  const theme = segmented('Theme', THEME_CHOICES, applyTheme);
  themeLabelGroup.append(theme.root);
  const resetBtn = el('button', 'demo-reset-btn', 'reset');
  resetBtn.type = 'button';
  resetBtn.addEventListener('click', onReset);
  row1.append(themeLabelGroup, resetBtn);

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

  // The theme reaches two places: the Gantt's own token layer (`gantt.theme`), and the page's
  // Paper class (`planner.ts` owns what it sets). Dark is the library's own `dark` — the design
  // calls it Graphite, and this page publishes the library's name so a reader meets one word for
  // one thing. Paper leaves `gantt.theme` on `light` and rides the consumer class instead
  // (design source line 66-86).
  function applyTheme(choice: PlannerThemeChoice): void {
    gantt.theme = choice === 'dark' ? 'dark' : 'light';
    theme.setActive(choice);
    onThemeChange(choice);
  }

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

  applyTheme(initialTheme);
  refresh();

  return { readout, setTheme: applyTheme };
}
