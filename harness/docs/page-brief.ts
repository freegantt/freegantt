// D-S5-29: every demo page opens with one short note, above the Gantt, for a reader who has never
// seen this library. It answers three questions: which features this page shows, the config that
// does it, and where the spec says so. One table holds every page's answer; every page calls one
// mount function.

import type { HarnessPageId } from '../harness-nav.js';

const PUBLIC_API = '../plans/02-public-api.md';
const PLUGIN_GUIDE = '../docs/06-plugin-authoring.md';
const STYLING_GUIDE = '../docs/10-styling-and-theming.md';
const BAR_IS_AN_ENTRY = '../docs/08-a-bar-is-an-entry.md';

/** One doorway into the spec. `label` is what a reader clicks; `href` is where it lands. */
interface SpecLink {
  readonly label: string;
  readonly href: string;
}

/** What one demo page shows: the features a reader can try, the API calls that back them, and the
 *  spec sections that govern them. */
interface PageBrief {
  readonly features: readonly string[];
  readonly config: readonly string[];
  readonly specLinks: readonly SpecLink[];
}

// Anchors point at plans/02-public-api.md's own headings. A markdown file has no live table of
// contents in a browser tab, so the fragment is a best-effort jump; the link text always names the
// section too.
const PAGE_BRIEFS: Record<HarnessPageId, PageBrief> = {
  planner: {
    features: [
      'Four themes for the whole page: Auto, Light, Dark, and Paper — a consumer theme made of --fg-* tokens alone',
      'Cell renderers: phase tags, owner avatars, compact dates, and the shipped meter() for Done',
      'Bar renderers: phase colours, progress shading, a critical-path ring, and labels placed by the library',
      'The shipped diamond() variant for checkpoints, and the summary rail for phases',
      'Weekend shading, the today line, and Day / Week / Month zoom',
      'Tooltips, a context menu, inline editing, and undo / redo',
    ],
    config: [
      "gridColumns: [{ field: 'owner', columnRenderer }, …]",
      "barRenderer: ({ entry }) => ({ style: { '--fg-bar-fill': … } })",
      "document.documentElement.setAttribute('data-fg-theme', 'dark')",
      ':root.theme-paper { --fg-pane-bg: …; --fg-bar-fill: … }',
    ],
    specLinks: [
      { label: 'plans/02 §4.1 — Per-entry looks and actions', href: `${PUBLIC_API}#41-per-entry-looks-and-actions` },
      { label: 'docs/10 — Styling and theming', href: STYLING_GUIDE },
    ],
  },
  'generic-demo': {
    features: [
      'The smallest setup that works: one Dataset, one Gantt',
      'A tree grid with editable columns, and a row that draws its children as segments',
      'The toolbar a consumer ships: undo / redo, expand / collapse, zoom, presets, snap, and Today',
      'A bench below the torn rule that drives mutation, vetoes, plugins, renderers, and JSON round-trips',
    ],
    config: ["new Dataset({ entries, timeZone: 'UTC' })", "new Gantt({ container: '#gantt', dataset })"],
    specLinks: [{ label: 'plans/02 §2 — Shape', href: `${PUBLIC_API}#2-shape` }],
  },
  'editing-and-data': {
    features: [
      'Drag and resize bars, and edit cells in place',
      'Programmatic mutation: every edit runs in one transaction and makes one changeset',
      'Undo and redo replay the same changeset log',
      'A beforeEntryMove veto refuses a drop before a hard date line',
      'A Dataset plugin locks an entry and refuses every edit to it',
      'Plugins over the public contract: a custom bar kind, an over-budget row, a chord command, and a popup',
      'JSON export and import round-trip the whole Dataset',
    ],
    config: [
      "dataset.entries.update(id, { name: '…' })",
      'dataset.undo() / dataset.redo()',
      "gantt.on('beforeEntryMove', (event) => event.refuse('…'))",
      'new Dataset({ entries, plugins: [lockEntries()] })',
      'gantt.installPlugin(bufferKind())',
    ],
    specLinks: [
      { label: 'plans/02 — Programmatic mutation', href: `${PUBLIC_API}#programmatic-mutation-always-transactional` },
      { label: 'plans/02 §3 — Events', href: `${PUBLIC_API}#3-events-one-bus-one-vocabulary` },
      { label: 'docs/06 — Plugin authoring guide', href: PLUGIN_GUIDE },
    ],
  },
  'hierarchy-and-timeline': {
    features: [
      'A tree of entries with roll-ups, and a phase that keeps its own dates (an owning parent)',
      'Group, sort, and filter the rows; resize and reorder grid columns by drag',
      'A row that draws its children as segments, with bar labels that fit or move outside',
      'Presets, zoom in / out, pan to today, and a locale switch for the header',
      'Date lines, the today line, weekend shading, and entries that start or end outside the range',
    ],
    config: [
      "gantt.rowSource = { source: 'entries', tree: true }",
      "fields: [{ key: 'start', rollUp: 'none' }, { key: 'end', rollUp: 'none' }]",
      "gantt.preset = 'weekAndMonth'",
      'gantt.zoomIn() / gantt.zoomOut() / gantt.panToToday()',
    ],
    specLinks: [
      { label: 'plans/02 §4.2 — Fields and grid columns', href: `${PUBLIC_API}#42-fields-and-grid-columns` },
      { label: '§4.3 — Row sources, collapse, and tree', href: `${PUBLIC_API}#43-row-sources-collapse-and-tree` },
      { label: 'docs/08 — A bar is an Entry', href: BAR_IS_AN_ENTRY },
    ],
  },
  performance: {
    features: [
      '50,000 entries in one Dataset, with the load and first-paint times on the page',
      'Virtualized rows and columns: the DOM holds only what the viewport shows',
      'Scroll, zoom, and preset changes over the whole dataset',
      'A second Gantt that shares the time scale and the horizontal scroll axis',
    ],
    config: [
      'new Dataset({ entries: fiftyThousandEntries })',
      'new Gantt({ container, dataset, scale, scroll: { x } })',
    ],
    specLinks: [
      { label: 'plans/02 §5 — Shared axes and scroll', href: `${PUBLIC_API}#5-shared-axes-and-scroll-multi-gantt-d9` },
    ],
  },
};

function labelledLine(label: string): HTMLParagraphElement {
  const line = document.createElement('p');
  const strong = document.createElement('strong');
  strong.textContent = `${label}: `;
  line.append(strong);
  return line;
}

/** Mounts one page's feature note into `container`. */
export function mountPageBrief(container: HTMLElement, pageId: HarnessPageId): void {
  const brief = PAGE_BRIEFS[pageId];
  container.classList.add('harness-page-brief');

  // Which features can the reader try on this page?
  const heading = document.createElement('h2');
  heading.textContent = 'Features on this page';
  const features = document.createElement('ul');
  for (const feature of brief.features) {
    const item = document.createElement('li');
    item.textContent = feature;
    features.append(item);
  }

  // Which API calls back them?
  const config = labelledLine('Config');
  brief.config.forEach((line, index) => {
    if (index > 0) config.append(' ');
    const code = document.createElement('code');
    code.textContent = line;
    config.append(code);
  });

  // Where does the spec say so?
  const spec = labelledLine('Spec');
  brief.specLinks.forEach((link, index) => {
    if (index > 0) spec.append(' · ');
    const anchor = document.createElement('a');
    anchor.href = link.href;
    anchor.textContent = link.label;
    spec.append(anchor);
  });

  container.append(heading, features, config, spec);
}
