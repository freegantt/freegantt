// D-S5-29: every gallery page opens with one short block, above the Gantt, that answers three
// questions for a reader who has never seen this library — what this page shows, the config that
// does it, and where the spec says so. One table holds every page's answer; every page calls one
// mount function. A page's own explanatory text lives here once, not eight times in eight HTML files.

import type { HarnessPageId } from '../harness-nav.js';

const PUBLIC_API = '../plans/02-public-api.md';
const PLUGIN_GUIDE = '../docs/06-plugin-authoring.md';

/** One doorway into the spec. `label` is what a reader clicks; `href` is where it lands. */
interface SpecLink {
  readonly label: string;
  readonly href: string;
}

/** What one gallery page demonstrates: the plain-English claim, the API call that backs it, and the
 *  spec section that governs it. */
interface PageBrief {
  readonly demonstrates: string;
  readonly config: readonly string[];
  readonly specLinks: readonly SpecLink[];
}

// Anchors point at plans/02-public-api.md's own headings. A markdown file has no live table of
// contents in a browser tab, so the fragment is a best-effort jump for an editor or a renderer that
// honours it; the link text always names the section too, for a reader whose viewer does not.
// Partial, not a full Record: D-S5-29 names eight gallery pages, not every `HarnessPageId`.
// `grid-scroll` and `docs` sit outside the gallery table on purpose and carry no entry here.
const PAGE_BRIEFS: Partial<Record<HarnessPageId, PageBrief>> = {
  'generic-demo': {
    demonstrates:
      'The nav above reaches every page in this gallery. The strip around the Gantt is the smallest ' +
      'setup that works — everything under the torn rule is harness apparatus, not library API.',
    config: ["new Dataset({ entries, timeZone: 'UTC' })", "new Gantt({ container: '#gantt', dataset })"],
    specLinks: [{ label: 'plans/02 §2 — Shape', href: `${PUBLIC_API}#2-shape` }],
  },
  mutation: {
    demonstrates:
      'Every edit runs inside one transaction and produces one changeset. Undo and redo replay the ' +
      'same log.',
    config: ["dataset.entries.update(id, { name: '…' })", 'dataset.undo() / dataset.redo()'],
    specLinks: [
      { label: 'plans/02 — Programmatic mutation', href: `${PUBLIC_API}#programmatic-mutation-always-transactional` },
      { label: 'Undo and redo', href: `${PUBLIC_API}#undo-and-redo` },
      { label: '§6 — Persistence', href: `${PUBLIC_API}#6-persistence-adr-0016` },
    ],
  },
  editing: {
    demonstrates:
      'Drag and resize move an entry by gesture. A beforeEntryMove veto refuses a drop before a hard ' +
      'boundary, and a Dataset plugin refuses an edit on a locked entry the same way.',
    config: [
      "gantt.on('beforeEntryMove', (event) => event.start < mobilization ? event.refuse('…') : undefined)",
      'dataset.plugins: [lockEntries()]',
    ],
    specLinks: [
      { label: 'plans/02 §3 — Events', href: `${PUBLIC_API}#3-events-one-bus-one-vocabulary` },
      { label: '§4.1 — Per-entry looks and actions', href: `${PUBLIC_API}#41-per-entry-looks-and-actions` },
    ],
  },
  planner: {
    demonstrates:
      'A shipped design, built on the public surface alone. Colour is tokens, cells the design draws ' +
      'as pictures are cell renderers, and a third theme the library never heard of is a consumer class.',
    config: [
      "gridColumns: [{ field: 'owner', cellRenderer }, …]",
      "barRenderer: { '*': ({ entry }) => ({ style: { '--fg-bar-fill': … } }) }",
      "body.theme-paper #gantt { --fg-pane-bg: …; --fg-bar-fill: … }",
    ],
    specLinks: [
      { label: 'plans/02 §4.1 — Per-entry looks and actions', href: `${PUBLIC_API}#41-per-entry-looks-and-actions` },
      { label: 'plans/02 §2 — Shape', href: `${PUBLIC_API}#2-shape` },
    ],
  },
  hierarchy: {
    demonstrates:
      'A tree of entries groups, sorts, and filters its rows. Grid columns resize and reorder by ' +
      'drag, and a beforeEntryEdit veto swaps in a different editor for one column.',
    config: [
      "gantt.rowSource = { source: 'entries', tree: true }",
      "gantt.gridColumns = ['name', 'start', 'end']",
      "gantt.on('beforeEntryEdit', (event) => …)",
    ],
    specLinks: [
      { label: 'plans/02 §4.2 — Fields and grid columns', href: `${PUBLIC_API}#42-fields-and-grid-columns` },
      { label: '§4.3 — Row sources, collapse, and tree', href: `${PUBLIC_API}#43-row-sources-collapse-and-tree` },
    ],
  },
  'timeline-navigation': {
    demonstrates:
      'A preset picker and zoom in/out step the timeline through named densities. panToToday() and a ' +
      "today-line toggle cover navigation; swap the dataset to see the density floor's effect.",
    config: ["gantt.preset = 'weekAndMonth'", 'gantt.zoomIn() / gantt.zoomOut()', 'gantt.panToToday()'],
    specLinks: [
      { label: 'plans/02 — Reconfiguration is just assignment', href: `${PUBLIC_API}#reconfiguration-is-just-assignment` },
    ],
  },
  'scroll-sync': {
    demonstrates:
      'Two Gantts share one ScrollModel and one TimeScaleModel. Scrolling either one moves both; the ' +
      "shorter chart pins at its own last row while the taller one keeps going.",
    config: ['const scroll = new ScrollModel();', 'new Gantt({ container, dataset, scale, scroll })'],
    specLinks: [
      { label: 'plans/02 §5 — Shared axes and scroll', href: `${PUBLIC_API}#5-shared-axes-and-scroll-multi-gantt-d9` },
    ],
  },
  'mount-destroy': {
    demonstrates:
      'A linked pair mounts and destroys over and over on one page, the way a single-page app ' +
      'mounts it on every visit. The shared TimeScaleModel and ScrollModel outlive every pair.',
    config: ['gantt.destroy()', 'new Gantt({ container, dataset, scale, scroll })'],
    specLinks: [
      { label: 'plans/02 §5 — Shared axes and scroll', href: `${PUBLIC_API}#5-shared-axes-and-scroll-multi-gantt-d9` },
    ],
  },
  'large-dataset': {
    demonstrates:
      'Five thousand entries render at a fixed frame cost. The DOM holds only the rows the viewport ' +
      "shows, however far the dataset scrolls in either direction.",
    config: ["const scale = new TimeScaleModel({ fit: 'preset' });", 'new Gantt({ container, dataset, scale })'],
    specLinks: [
      { label: 'plans/02 §5 — Shared axes and scroll', href: `${PUBLIC_API}#5-shared-axes-and-scroll-multi-gantt-d9` },
    ],
  },
  plugins: {
    demonstrates:
      'Four plugins install over the public plugin contract alone: weekend shading, a consumer-' +
      "defined 'buffer' kind, a command bound to a chord, and a popup anchored to a bar.",
    config: [
      'gantt.installPlugin(weekendShading())',
      'gantt.installPlugin(bufferKind())',
      "ctx.commands.register({ id: 'demo.clearSelection', run: … })",
    ],
    specLinks: [
      { label: 'plans/02 §4.4 — Plugin registrations', href: `${PUBLIC_API}#44-plugin-registrations-one-collision-policy-one-lifetime-155` },
      { label: 'docs/06 — Plugin authoring guide', href: PLUGIN_GUIDE },
    ],
  },
};

/** Mounts one page's brief into `container`. A page id with no entry (`grid-scroll` —
 *  eight gallery pages have a brief, not every harness page) leaves the container empty rather than throwing,
 *  so a page outside the gallery table can still call this without a special case. */
export function mountPageBrief(container: HTMLElement, pageId: HarnessPageId): void {
  const brief = PAGE_BRIEFS[pageId];
  if (brief === undefined) return;

  container.classList.add('harness-page-brief');

  const demonstrates = document.createElement('p');
  const demonstratesLabel = document.createElement('strong');
  demonstratesLabel.textContent = 'Demonstrates: ';
  demonstrates.append(demonstratesLabel, brief.demonstrates);

  const config = document.createElement('p');
  const configLabel = document.createElement('strong');
  configLabel.textContent = 'Config: ';
  config.append(configLabel);
  brief.config.forEach((line, index) => {
    if (index > 0) config.append(', ');
    const code = document.createElement('code');
    code.textContent = line;
    config.append(code);
  });

  const spec = document.createElement('p');
  const specLabel = document.createElement('strong');
  specLabel.textContent = 'Spec: ';
  spec.append(specLabel);
  brief.specLinks.forEach((link, index) => {
    if (index > 0) spec.append(', ');
    const anchor = document.createElement('a');
    anchor.href = link.href;
    anchor.textContent = link.label;
    spec.append(anchor);
  });

  container.append(demonstrates, config, spec);
}
