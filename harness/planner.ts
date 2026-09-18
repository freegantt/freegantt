import './harness-nav.ts';
import {
  Gantt,
  Dataset,
  tooltips,
  contextMenu,
  inlineEditing,
  formatDate,
  formatEndInclusive,
  diamond,
  meter,
  timeShading,
  daysOfWeek,
} from 'freegantt';
import type {
  BarRendererContext,
  ColumnRendererContext,
  ElementDescription,
  EntryId,
  GridColumnInput,
  Instant,
  EntryVariant,
  ResolvedBarLabel,
} from 'freegantt';
import { plannerEntryInputs, plannerFieldOptions, plannerSpan } from '../fixtures/planner-dataset.js';
import type { PlannerEntryProps } from '../fixtures/planner-dataset.js';
import { mountPlannerToolbar } from './planner-toolbar.js';
import type { PlannerThemeChoice } from './planner-toolbar.js';
import { mountPageBrief } from './docs/page-brief.js';

// D-S5-29: what this page shows, the config that does it, and the spec section behind it.
mountPageBrief(document.querySelector<HTMLDivElement>('#page-brief')!, 'planner');

const dataset = new Dataset<PlannerEntryProps>({
  entries: plannerEntryInputs,
  timeZone: 'UTC',
  ...plannerFieldOptions,
});

// The design's own column set, left to right. Each one names a Field and carries presentation only —
// the width, the alignment, and where a cell paints something other than its formatted text.
const GRID_COLUMNS: readonly GridColumnInput[] = [
  { field: 'ref', align: 'center', width: 44 },
  { field: 'name', header: 'Task', width: 210, columnRenderer: taskCell },
  { field: 'owner', width: 48, columnRenderer: ownerCell },
  { field: 'duration', header: 'Dur', align: 'end', width: 52, columnRenderer: durationCell },
  { field: 'start', align: 'end', width: 72, columnRenderer: startCell },
  { field: 'end', header: 'Finish', align: 'end', width: 72, columnRenderer: finishCell },
  // The Done cell is core's meter. This page does not re-implement it.
  { field: 'progress', header: 'Done', width: 82, columnRenderer: meter() },
];

// ---- Cells the design paints as something other than text ------------------------------------

/** Which phase hue a row belongs to, as the custom property this page's own CSS defines per theme.
 *  A number would have to be re-derived per theme in script; a property name lets CSS answer. */
function phaseFill(phase: unknown): string | undefined {
  return typeof phase === 'number' ? `var(--demo-phase-${phase})` : undefined;
}

/** The Task cell: a phase-coloured tag and the name. A group and a checkpoint carry no tag — their
 *  bar already says which phase they are. */
function taskCell({ entry, value }: ColumnRendererContext): ElementDescription | undefined {
  if (entry === undefined) return undefined;
  const phase = entry.read('phase');
  const isPhase = entry.hasChildren;
  const isCheckpoint = entry.read('checkpoint') === true;
  const children: (ElementDescription & { key?: string })[] = [];
  const fill = phaseFill(phase);
  if (fill !== undefined && !isPhase && !isCheckpoint) {
    children.push({ key: 'tag', class: { 'demo-phase-tag': true }, style: { background: fill } });
  }
  children.push({ key: 'name', class: { 'demo-task-name': true }, text: value });
  return { class: { 'demo-task-cell': true, 'demo-task-cell-group': isPhase }, children };
}

/** The Own cell: initials in a phase-coloured disc. `image()` paints a photo; this column stays
 *  initials — the design's own mark, not a URL. */
function ownerCell({ entry, value }: ColumnRendererContext): ElementDescription | undefined {
  if (value === '') return { text: '' };
  const fill = phaseFill(entry?.read('phase'));
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
function startCell({ fieldValue }: ColumnRendererContext): ElementDescription | undefined {
  if (fieldValue === undefined) return { text: '' };
  return { text: formatDate(dataset.timeZone, fieldValue as Instant, undefined, COMPACT_DATE_FORMAT) };
}

/** The Finish cell: `formatEndInclusive`, the one place storage's half-open `end` becomes the
 *  inclusive date a reader expects, in the same compact format as Start. */
function finishCell({ entry, fieldValue }: ColumnRendererContext): ElementDescription | undefined {
  if (entry === undefined || fieldValue === undefined) return { text: '' };
  // End with no start (ADR 0012) shows the stored end as a plain instant — same rule the core
  // `end` Field's own `formatEnd` follows in `src/data/fields/core-fields.ts`.
  if (entry.start === undefined) {
    return { text: formatDate(dataset.timeZone, fieldValue as Instant, undefined, COMPACT_DATE_FORMAT) };
  }
  const span = { start: entry.start, end: fieldValue as Instant };
  return { text: formatEndInclusive(dataset.timeZone, span, undefined, COMPACT_DATE_FORMAT) };
}

/** The Dur cell: the design's `12d` — no space, lowercase `d`. The core `duration` Field already
 *  formats `12 d`; this tightens that string's own punctuation rather than re-deriving a day count,
 *  so no time arithmetic runs on this page. */
function durationCell({ value }: ColumnRendererContext): ElementDescription | undefined {
  return { text: value.replace(' d', 'd') };
}

// ---- Bars ------------------------------------------------------------------------------------

/** The bar's own label, on the side the library placed it (DESIGN-FACTS §2.3). The fit test is the
 *  library's — `label.placement` is the answer for this bar at this width — so this page paints text
 *  and measures none. */
function barLabel(label: ResolvedBarLabel, styleClass?: string): ElementDescription & { key: string } {
  return {
    key: 'label',
    class: {
      'demo-bar-label': true,
      'demo-bar-label-outside': label.placement === 'outside',
      ...(styleClass === undefined ? {} : { [styleClass]: true }),
    },
    text: label.text,
  };
}

/** How far along one row is, as the percentage the design paints. `undefined` for a row that
 *  declares no progress at all, which is not the same fact as `0`. */
function progressOf(entryId: EntryId): number | undefined {
  const progress = dataset.entries.get(entryId)?.read('progress');
  return typeof progress === 'number' ? Math.max(0, Math.min(100, progress)) : undefined;
}

/** A span bar: its phase's hue, the design's progress shading (DESIGN-FACTS §2.2) — a child rect
 *  pinned to the left edge, darkened 22% black over the fill, so a part-done row reads part-filled —
 *  its label, and an inset ring when the row is on the critical path. `'*'` registers it as the
 *  catch-all, so any kind this page does not answer for by name lands here. */
function phaseBar({ entry, label }: BarRendererContext): ElementDescription | undefined {
  const fill = phaseFill(entry.read('phase'));
  const description: ElementDescription = { class: { 'demo-critical': entry.read('critical') === true } };
  if (fill !== undefined) description.style = { '--fg-bar-fill': fill };

  const children: (ElementDescription & { key?: string })[] = [];
  const percent = progressOf(entry.id);
  if (percent !== undefined) {
    children.push({ key: 'progress', class: { 'demo-bar-progress': true }, style: { width: `${percent}%` } });
  }
  if (label !== undefined) children.push(barLabel(label));
  // The critical ring is a child, not a box-shadow on the bar. The bar's own shadow slot belongs to
  // the library — `hovered` and `dragging` both paint there — and a second box-shadow rule on
  // `.fg-bar` would replace theirs rather than join it. A nested ring composes with both for free.
  if (entry.read('critical') === true) {
    children.push({ key: 'critical', class: { 'demo-critical-ring': true } });
  }
  if (children.length > 0) description.children = children;
  return description;
}

/** A checkpoint's own fill: row ink when done, pane background behind a stroke while it is not
 *  (DESIGN-FACTS §2.5) — `diamond()` supplies the box, its own size at every zoom, and the `css`
 *  that cancels `.fg-bar`'s background and state ring; this page states only the fill and the
 *  label, over `diamond()`'s own published `paint` override (ADR 0022). It keeps `diamond()`'s own
 *  class, `fg-bar-diamond`, because a `paint` override replaces the factory's default answer rather
 *  than joining it — dropping the class would lose the glyph shape along with the fill. */
function checkpointDiamond({ entry, label }: BarRendererContext): ElementDescription | undefined {
  const done = progressOf(entry.id) === 100;
  const description: ElementDescription = {
    class: { 'fg-bar-diamond': true },
    style: done
      ? { '--fg-bar-fill': 'var(--fg-row-label-color)' }
      : {
          '--fg-bar-fill': 'var(--fg-pane-bg)',
          '--demo-checkpoint-stroke': '1.5px solid var(--fg-row-label-color)',
        },
  };
  if (label !== undefined) description.children = [barLabel(label, 'demo-checkpoint-label')];
  return description;
}

// ADR 0022: a checkpoint is a zero-duration row, and `diamond()` is core's own shipped glyph for
// one — this page states which rows wear it and, through `paint`, how a done one differs from one
// that is not (`checkpointDiamond`, above). Its box still holds its own size at every zoom.
//
// A phase needs no entry at all. Core's own `summary` variant already matches a row with children and
// paints the rail the design draws, so this page states neither the rule nor the paint (`J40`).
const PLANNER_VARIANTS: readonly EntryVariant<PlannerEntryProps>[] = [
  diamond({ when: { checkpoint: true }, paint: checkpointDiamond }),
];

const gantt = new Gantt({
  container: '#gantt',
  dataset,
  gridColumns: GRID_COLUMNS,
  gridWidth: 'fitColumns',
  rowSource: { source: 'entries', tree: true },
  // The design frames the whole build rather than a window into it. Row height is a token, not an
  // option — and the design's own 36px is the library's default now, so this page states nothing.
  range: plannerSpan,
  preset: 'weekAndMonth',
  // Every bar this page paints that no variant above matches.
  barRenderer: phaseBar,
  variants: PLANNER_VARIANTS,
});

// ---- Chrome ----------------------------------------------------------------------------------

// Weekends shade under the bars the way the design does (DESIGN-FACTS §1.2) — #404's shipped
// timeShading() built-in. This page overrides the wash with its own themed colour
// (--planner-weekend-bg below, on the 'planner-weekend' class), the level-2 customization ladder
// rung — most consumers take the library default (--fg-time-shading-fill) and write no CSS at all.
gantt.installPlugin(timeShading([{ covers: daysOfWeek(6, 7), class: 'planner-weekend' }]));

const THEME_STORAGE_KEY = 'freegantt-planner-theme';

function isPlannerTheme(value: string | null): value is PlannerThemeChoice {
  return value === 'light' || value === 'dark' || value === 'paper';
}

/** What the page opens on when nobody has picked yet: whatever the reader's own system asks for.
 *  A stored choice always wins — picking Light on a dark desktop is a choice, not a mistake.
 *  Reads `gantt.resolvedTheme` (#330) rather than `matchMedia` directly — the library already
 *  resolves `'auto'` against the OS (and an ancestor's own pin, #271), and this page's own Gantt is
 *  still on that default here, before the toolbar below ever calls `gantt.theme = …`. */
function preferredTheme(): PlannerThemeChoice {
  return gantt.resolvedTheme;
}

function readStoredTheme(): PlannerThemeChoice {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return isPlannerTheme(stored) ? stored : preferredTheme();
  } catch {
    return preferredTheme();
  }
}

// Paper is the design's third theme, and it is a consumer class over `--fg-*` alone (see this page's
// own stylesheet). It rides beside the library's Light/Dark rather than inside them, which is the
// claim it exists to prove: a theme is only tokens, so a consumer can ship one the library never
// heard of. Choosing Paper leaves `gantt.theme` on Light (`planner-toolbar.ts`'s own job) — the
// class wins on specificity.
function applyPlannerTheme(choice: PlannerThemeChoice): void {
  document.body.classList.toggle('theme-paper', choice === 'paper');
  // The toolbar sits above the Gantt, outside `.fg-container`, and paints from `--fg-*` like
  // everything else on this page. The same pin the library writes on its own container, written here
  // on the page, gives the chrome the theme's token set — no hex value is restated for it.
  document.body.dataset['fgTheme'] = choice === 'dark' ? 'dark' : 'light';
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
  // A selected row may hold neither, one, or both dates (ADR 0012) — show whichever it has,
  // instead of assuming the pair `formatEndInclusive` needs.
  const span =
    first.start !== undefined && first.end !== undefined
      ? `${formatDate(zone, first.start)} → ${formatEndInclusive(zone, { start: first.start, end: first.end })}`
      : first.start !== undefined
        ? `${formatDate(zone, first.start)} → —`
        : first.end !== undefined
          ? `— → ${formatDate(zone, first.end)}`
          : 'No dates';
  const done = first.read('progress');
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
