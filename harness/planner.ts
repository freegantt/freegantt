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
  EntryId,
  GridColumnInput,
  Instant,
  EntryVariant,
  ResolvedBarLabel,
} from '../src/api/index.js';
import { plannerEntryInputs, plannerFieldOptions, plannerSpan } from '../fixtures/planner-dataset.js';
import type { PlannerEntryProps } from '../fixtures/planner-dataset.js';
import { mountPlannerToolbar } from './planner-toolbar.js';
import type { PlannerThemeChoice } from './planner-toolbar.js';
import { weekendShading } from './plugins/weekend-shading.js';
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

/** The Own cell: initials in a phase-coloured disc. #264 tracks the image column type this wants to
 *  be — a photo rather than initials — which has no declared Field type yet. Initials until it does. */
function ownerCell({ entry, value }: ColumnCellRendererContext): ElementDescription | undefined {
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
function startCell({ fieldValue }: ColumnCellRendererContext): ElementDescription | undefined {
  if (fieldValue === undefined) return { text: '' };
  return { text: formatDate(dataset.timeZone, fieldValue as Instant, undefined, COMPACT_DATE_FORMAT) };
}

/** The Finish cell: `formatEndInclusive`, the one place storage's half-open `end` becomes the
 *  inclusive date a reader expects, in the same compact format as Start. */
function finishCell({ entry, fieldValue }: ColumnCellRendererContext): ElementDescription | undefined {
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

/** A phase's rail is the library's own paint, and the design draws exactly that: a solid rail in the
 *  row ink, with end caps and no label. `undefined` keeps it, so this kind opts out of the page's
 *  own bar paint rather than restating it. */
function phaseRail(): ElementDescription | undefined {
  return undefined;
}

/** A checkpoint (DESIGN-FACTS §2.5): a diamond glyph, filled when the checkpoint is done and hollow —
 *  the pane's background behind a 1.5px stroke — while it is not. Which one is a fact about this
 *  page's data, so the page answers it. ADR 0013 retired core's diamond, so this page owns the shape
 *  too: `.demo-checkpoint` in `planner.html` draws it, and this renderer names the fill and the
 *  stroke. The label rides in the row ink beside it, not in the fill's own ink: there is no fill to
 *  read a label against. */
function checkpointDiamond({ entry, label }: BarRendererContext): ElementDescription | undefined {
  const done = progressOf(entry.id) === 100;
  const description: ElementDescription = {
    class: { 'demo-checkpoint': true },
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

// ADR 0018: three variants, three rules. Core already answers `'parent'` for any row with children,
// so this page re-skins that one rather than re-deriving it, and a checkpoint states its own rule
// against the Field the fixture writes. Nothing here stores a variant, and nothing keeps a list of
// the rows it owns.
const PLANNER_VARIANTS: readonly EntryVariant<PlannerEntryProps>[] = [
  { name: 'parent', when: (entry) => entry.hasChildren, paint: phaseRail },
  { name: 'checkpoint', when: { checkpoint: true }, paint: checkpointDiamond },
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
  // Every bar this page paints that no variant above claims.
  barRenderer: phaseBar,
  variants: PLANNER_VARIANTS,
});

// ---- Chrome ----------------------------------------------------------------------------------

// Weekends shade under the bars the way the design does (DESIGN-FACTS §1.2) — a working plugin over
// the public surface alone, install and a CSS band, nothing this page re-derives.
gantt.installPlugin(weekendShading());

const THEME_STORAGE_KEY = 'freegantt-planner-theme';

function isPlannerTheme(value: string | null): value is PlannerThemeChoice {
  return value === 'light' || value === 'dark' || value === 'paper';
}

/** What the page opens on when nobody has picked yet: whatever the reader's own system asks for.
 *  A stored choice always wins — picking Light on a dark desktop is a choice, not a mistake. */
function preferredTheme(): PlannerThemeChoice {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
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
