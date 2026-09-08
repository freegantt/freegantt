import './harness-nav.ts';
import {
  Gantt,
  Dataset,
  tooltips,
  contextMenu,
  inlineEditing,
  formatDate,
  formatEndInclusive,
} from '../src/api/index.js';
import type {
  BarRendererContext,
  ColumnCellRendererContext,
  ElementDescription,
  GridColumnInput,
  Instant,
  RendererByKind,
} from '../src/api/index.js';
import { plannerEntryInputs, plannerFieldOptions, plannerSpan } from '../fixtures/planner-dataset.js';
import type { PlannerMeta } from '../fixtures/planner-dataset.js';
import { mountPlannerToolbar } from './planner-toolbar.js';
import type { PlannerThemeChoice } from './planner-toolbar.js';
import { weekendShading } from './plugins/weekend-shading.js';
import { mountPageBrief } from './docs/page-brief.js';

// D-S5-29: what this page shows, the config that does it, and the spec section behind it.
mountPageBrief(document.querySelector<HTMLDivElement>('#page-brief')!, 'planner');

const dataset = new Dataset<PlannerMeta, { owner?: string; progress?: number; phase?: number }>({
  entries: plannerEntryInputs,
  timeZone: 'UTC',
  ...plannerFieldOptions,
});

// The design's own column set, left to right. Each one names a Field and carries presentation only —
// the width, the alignment, and where a cell paints something other than its formatted text.
const GRID_COLUMNS: readonly GridColumnInput[] = [
  { field: 'ref', align: 'center', width: 44 },
  { field: 'name', header: 'Task', width: 210, cellRenderer: taskCell },
  { field: 'owner', width: 48, cellRenderer: ownerCell },
  { field: 'duration', header: 'Dur', align: 'end', width: 52, cellRenderer: durationCell },
  { field: 'start', align: 'end', width: 72, cellRenderer: startCell },
  { field: 'end', header: 'Finish', align: 'end', width: 72, cellRenderer: finishCell },
  { field: 'progress', header: 'Done', width: 82, cellRenderer: progressCell },
];

// ---- Cells the design paints as something other than text ------------------------------------

/** Which phase hue a row belongs to, as the custom property this page's own CSS defines per theme.
 *  A number would have to be re-derived per theme in script; a property name lets CSS answer. */
function phaseFill(phase: unknown): string | undefined {
  return typeof phase === 'number' ? `var(--demo-phase-${phase})` : undefined;
}

/** The Task cell: a phase-coloured tag and the name. A group and a checkpoint carry no tag — their
 *  bar already says which phase they are. */
function taskCell({ entry, value }: ColumnCellRendererContext): ElementDescription | undefined {
  if (entry === undefined) return undefined;
  const meta = entry.meta as PlannerMeta | undefined;
  const children: (ElementDescription & { key?: string })[] = [];
  const fill = phaseFill(meta?.phase);
  if (fill !== undefined && entry.kind !== 'group' && entry.kind !== 'milestone') {
    children.push({ key: 'tag', class: { 'demo-phase-tag': true }, style: { background: fill } });
  }
  children.push({ key: 'name', class: { 'demo-task-name': true }, text: value });
  return { class: { 'demo-task-cell': true, 'demo-task-cell-group': entry.kind === 'group' }, children };
}

/** The Own cell: initials in a phase-coloured disc. #264 tracks the image column type this wants to
 *  be — a photo rather than initials — which has no declared Field type yet. Initials until it does. */
function ownerCell({ entry, value }: ColumnCellRendererContext): ElementDescription | undefined {
  if (value === '') return { text: '' };
  const fill = phaseFill((entry?.meta as PlannerMeta | undefined)?.phase);
  return {
    class: { 'demo-avatar': true },
    ...(fill === undefined ? {} : { style: { background: fill } }),
    attrs: { title: `Owner ${value}` },
    text: value,
  };
}

// The design's compact Start/Finish format: two-digit day, three-letter month, no year, no time —
// `02 Mar`, not the core Field's own `Jun 29, 2026, 12:00 AM`. Both `formatDate` and
// `formatEndInclusive` already take an `Intl.DateTimeFormatOptions` override; this page just picks
// a narrower one than their shared default.
const COMPACT_DATE_FORMAT: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short' };

/** The Start cell: `formatDate` alone, in the compact format — a start needs no inclusive-end
 *  conversion (that is `formatEndInclusive`'s job, below). */
function startCell({ fieldValue }: ColumnCellRendererContext): ElementDescription | undefined {
  if (fieldValue === undefined) return { text: '' };
  return { text: formatDate(dataset.timeZone, fieldValue as Instant, undefined, COMPACT_DATE_FORMAT) };
}

/** The Finish cell: `formatEndInclusive`, the one place storage's half-open `end` becomes the
 *  inclusive date a reader expects, in the same compact format as Start. */
function finishCell({ entry, fieldValue }: ColumnCellRendererContext): ElementDescription | undefined {
  if (entry === undefined || fieldValue === undefined) return { text: '' };
  const span = { start: entry.start, end: fieldValue as Instant };
  return { text: formatEndInclusive(dataset.timeZone, span, undefined, COMPACT_DATE_FORMAT) };
}

/** The Dur cell: the design's `12d` — no space, lowercase `d`. The core `duration` Field already
 *  formats `12 d`; this tightens that string's own punctuation rather than re-deriving a day count,
 *  so no time arithmetic runs on this page. */
function durationCell({ value }: ColumnCellRendererContext): ElementDescription | undefined {
  return { text: value.replace(' d', 'd') };
}

/** The Done cell: a meter beside the percentage. `role="img"` with the formatted value as its label,
 *  so the bar is one described graphic instead of two unlabelled divs. */
function progressCell({ value, fieldValue }: ColumnCellRendererContext): ElementDescription | undefined {
  const percent = typeof fieldValue === 'number' ? Math.max(0, Math.min(100, fieldValue)) : 0;
  return {
    class: { 'demo-progress': true },
    children: [
      {
        key: 'track',
        class: { 'demo-progress-track': true },
        attrs: { role: 'img', 'aria-label': `${value} complete` },
        children: [{ key: 'fill', class: { 'demo-progress-fill': true }, style: { width: `${percent}%` } }],
      },
      { key: 'text', class: { 'demo-progress-text': true }, text: value },
    ],
  };
}

// ---- Bars ------------------------------------------------------------------------------------

/** Every bar takes its phase's hue, and a critical-path bar takes an inset ring on top of it. A
 *  span bar also takes the design's progress shading (DESIGN-FACTS §2.2) — a child rect pinned to
 *  its left edge, darkened 22% black over the fill, so a part-done row reads as part-filled. The
 *  shape of a group bracket and of a milestone diamond stays the library's own (D-S4-24, structural
 *  from `entry.kind`) — neither has room for a progress child of its own, and a renderer recolours
 *  them through `--fg-bar-fill` and adds nothing else. `'*'` is the catch-all, so one function
 *  answers for all three kinds. */
function phaseBar({ entry }: BarRendererContext): ElementDescription | undefined {
  const meta = entry.meta as PlannerMeta | undefined;
  const fill = phaseFill(meta?.phase);
  const description: ElementDescription = { class: { 'demo-critical': meta?.critical === true } };
  if (fill !== undefined) description.style = { '--fg-bar-fill': fill };

  const children: (ElementDescription & { key?: string })[] = [];
  if (entry.kind !== 'group' && entry.kind !== 'milestone') {
    const progress = dataset.entries.fieldValue(entry.id, 'progress');
    if (typeof progress === 'number') {
      const percent = Math.max(0, Math.min(100, progress));
      children.push({
        key: 'progress',
        class: { 'demo-bar-progress': true },
        style: { width: `${percent}%` },
      });
    }
  }
  // The critical ring is a child, not a box-shadow on the bar. The bar's own shadow slot belongs to
  // the library — `hovered` and `dragging` both paint there — and a second box-shadow rule on
  // `.fg-bar` would replace theirs rather than join it. A nested ring composes with both for free.
  if (meta?.critical === true) {
    children.push({ key: 'critical', class: { 'demo-critical-ring': true } });
  }
  if (children.length > 0) description.children = children;
  return description;
}

const PHASE_BARS: RendererByKind = { '*': phaseBar };

const gantt = new Gantt({
  container: '#gantt',
  dataset,
  gridColumns: GRID_COLUMNS,
  gridWidth: 'fitColumns',
  rowSource: { source: 'entries', tree: true },
  // The design frames the whole build rather than a window into it. Row height is a token, not an
  // option — this page sets `--fg-row-height` in its own stylesheet.
  range: plannerSpan,
  preset: 'weekAndMonth',
  barRenderer: PHASE_BARS,
});

// ---- Chrome ----------------------------------------------------------------------------------

// Weekends shade under the bars the way the design does (DESIGN-FACTS §1.2) — a working plugin over
// the public surface alone, install and a CSS band, nothing this page re-derives.
gantt.installPlugin(weekendShading());

const THEME_STORAGE_KEY = 'freegantt-planner-theme';

function isPlannerTheme(value: string | null): value is PlannerThemeChoice {
  return value === 'light' || value === 'graphite' || value === 'paper';
}

function readStoredTheme(): PlannerThemeChoice {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return isPlannerTheme(stored) ? stored : 'light';
  } catch {
    return 'light';
  }
}

// Paper is the design's third theme, and it is a consumer class over `--fg-*` alone (see this page's
// own stylesheet). It rides beside the library's Light/Dark rather than inside them, which is the
// claim it exists to prove: a theme is only tokens, so a consumer can ship one the library never
// heard of. Choosing Paper leaves `gantt.theme` on Light (`planner-toolbar.ts`'s own job) — the
// class wins on specificity.
function applyPlannerTheme(choice: PlannerThemeChoice): void {
  document.body.classList.toggle('theme-paper', choice === 'paper');
  try {
    localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // Persisting the choice is a convenience; failing to persist it is not worth an error.
  }
}

// Not wired yet, on purpose: the design draws the button, and what a new row should inherit from the
// selected phase is a product decision nobody has made. It says so rather than doing half of it.
function handleNewTask(): void {
  setReadout('New task is not wired up yet — the design draws the button, the behaviour is undecided.');
}

// The design's own `reset` (source line 106, 854): back to the plan as authored. Every step is a
// command or a property this page already runs elsewhere — undo to the bottom of the stack, clear
// the selection, and put the view back where it opened. What it cannot reach is the redo stack: no
// published call discards it, so a `redo` right after `reset` still re-applies what was undone here,
// unlike the design's own in-memory reset. That gap is `dataset`'s, not this page's, to close.
function resetToOpeningState(): void {
  while (dataset.canUndo) dataset.undo();
  gantt.commands.run('freegantt.clearSelection');
  gantt.commands.run('freegantt.expandAll');
  gantt.preset = 'weekAndMonth';
  gantt.commands.run('freegantt.panToToday');
  toolbar.setTheme('light');
}

const toolbar = mountPlannerToolbar({
  gantt,
  container: document.querySelector<HTMLDivElement>('#toolbar')!,
  projectName: 'Northgate Mixed-Use Build',
  projectSpan: plannerSpan,
  onNewTask: handleNewTask,
  onReset: resetToOpeningState,
  onThemeChange: applyPlannerTheme,
  initialTheme: readStoredTheme(),
});

const readout = toolbar.readout;
readout.id = 'readout';

function setReadout(text: string): void {
  readout.textContent = text;
}

/** The design's status line: what is picked, when it runs, and how far along it is. The finish date
 *  goes through `formatEndInclusive` — storage is half-open `[start, end)` and display is inclusive,
 *  and that helper is the one place the library does the conversion. */
function renderSelection(): void {
  const entries = gantt.selectedEntries;
  const first = entries[0];
  if (first === undefined) {
    setReadout('Nothing selected — click a bar or a row.');
    return;
  }
  const zone = dataset.timeZone;
  const span = `${formatDate(zone, first.start)} → ${formatEndInclusive(zone, first)}`;
  const done = dataset.entries.fieldValue(first.id, 'progress');
  const percent = typeof done === 'number' ? ` · ${done}%` : '';
  const more = entries.length > 1 ? ` · +${entries.length - 1} more` : '';
  setReadout(`${first.name} · ${span}${percent}${more}`);
}

gantt.on('selectionChange', renderSelection);
dataset.on('change', renderSelection);
renderSelection();

// The three shipped built-ins, installed as values — hover a bar for its dates, right-click for the
// menu, double-click a Task, Start, Finish or Done cell to edit it in place. `#` refuses the editor:
// it is `compute`-sourced and has no stored home to write back to.
gantt.installPlugin(tooltips());
gantt.installPlugin(contextMenu());
gantt.installPlugin(inlineEditing());

// A test seam, the same one every other harness page exposes.
window.__gantt = gantt;
