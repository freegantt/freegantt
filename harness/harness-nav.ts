// `harness/docs/page-brief.ts` reads this id too — one page identifies itself with the same value
// both modules key on, so a page's nav entry and its explanatory block never drift apart.
export type HarnessPageId =
  | 'generic-demo'
  | 'hierarchy'
  | 'scroll-sync'
  | 'grid-scroll'
  | 'bar-label-fit'
  | 'dense-tile-grid'
  | 'timeline-navigation'
  | 'large-dataset'
  | 'mutation'
  | 'editing'
  | 'planner'
  | 'plugins'
  | 'mount-destroy'
  | 'entries-outside-the-range'
  | 'theme-push';

type HarnessPage = {
  readonly id: HarnessPageId;
  readonly label: string;
  readonly file: string;
};

const HARNESS_PAGES: readonly HarnessPage[] = [
  { id: 'generic-demo', label: 'Generic demo', file: 'index.html' },
  { id: 'hierarchy', label: 'Hierarchy & rows', file: 'hierarchy.html' },
  { id: 'scroll-sync', label: 'Scroll sync', file: 'scroll-sync.html' },
  { id: 'grid-scroll', label: 'Grid pane scroll', file: 'grid-scroll.html' },
  { id: 'bar-label-fit', label: 'Bar label fit', file: 'bar-label-fit.html' },
  { id: 'dense-tile-grid', label: 'Dense tile grid virtualization', file: 'dense-tile-grid.html' },
  { id: 'timeline-navigation', label: 'Timeline & navigation', file: 'zoom.html' },
  { id: 'large-dataset', label: 'Large dataset', file: 'large-dataset.html' },
  { id: 'mutation', label: 'Mutation & live binding', file: 'data.html' },
  { id: 'editing', label: 'Direct manipulation', file: 'editing.html' },
  { id: 'planner', label: 'Planner (design)', file: 'planner.html' },
  { id: 'plugins', label: 'Plugin runtime', file: 'plugins.html' },
  { id: 'mount-destroy', label: 'Mount & destroy', file: 'mount-destroy.html' },
  {
    id: 'entries-outside-the-range',
    label: 'Entries outside the range (#436)',
    file: 'entries-outside-the-range.html',
  },
  { id: 'theme-push', label: 'Theme push', file: 'theme-push.html' },
];

function detectCurrentPage(pathname: string): HarnessPageId {
  const file = pathname.split('/').pop() ?? 'index.html';
  switch (file) {
    case '':
    case 'index.html':
      return 'generic-demo';
    case 'hierarchy.html':
      return 'hierarchy';
    case 'scroll-sync.html':
      return 'scroll-sync';
    case 'grid-scroll.html':
      return 'grid-scroll';
    case 'bar-label-fit.html':
      return 'bar-label-fit';
    case 'dense-tile-grid.html':
      return 'dense-tile-grid';
    case 'zoom.html':
      return 'timeline-navigation';
    case 'large-dataset.html':
      return 'large-dataset';
    case 'data.html':
      return 'mutation';
    case 'editing.html':
      return 'editing';
    case 'planner.html':
      return 'planner';
    case 'plugins.html':
      return 'plugins';
    case 'mount-destroy.html':
      return 'mount-destroy';
    case 'entries-outside-the-range.html':
      return 'entries-outside-the-range';
    case 'theme-push.html':
      return 'theme-push';
    default:
      return 'generic-demo';
  }
}

function pageHref(page: HarnessPage): string {
  return `./${page.file}`;
}

function mountHarnessNav(nav: HTMLElement): void {
  const current = detectCurrentPage(window.location.pathname);

  for (const page of HARNESS_PAGES) {
    const link = document.createElement('a');
    link.href = pageHref(page);
    link.textContent = page.label;
    if (page.id === current) {
      link.setAttribute('aria-current', 'page');
    }
    nav.append(link);
  }
}

document.querySelectorAll<HTMLElement>('.harness-site-nav').forEach((nav) => {
  mountHarnessNav(nav);
});
