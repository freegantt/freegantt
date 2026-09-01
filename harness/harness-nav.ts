type HarnessPageId =
  | 'generic-demo'
  | 'hierarchy'
  | 'scroll-sync'
  | 'timeline-navigation'
  | 'large-dataset'
  | 'mutation'
  | 'editing'
  | 'docs';

type HarnessPage = {
  readonly id: HarnessPageId;
  readonly label: string;
  readonly file: string;
};

const HARNESS_PAGES: readonly HarnessPage[] = [
  { id: 'generic-demo', label: 'Generic demo', file: 'index.html' },
  { id: 'hierarchy', label: 'Hierarchy & rows', file: 'hierarchy.html' },
  { id: 'scroll-sync', label: 'Scroll sync', file: 'scroll-sync.html' },
  { id: 'timeline-navigation', label: 'Timeline & navigation', file: 'zoom.html' },
  { id: 'large-dataset', label: 'Large dataset', file: 'large-dataset.html' },
  { id: 'mutation', label: 'Mutation & live binding', file: 'data.html' },
  { id: 'editing', label: 'Direct manipulation', file: 'editing.html' },
  { id: 'docs', label: 'Docs', file: 'docs/index.html' },
];

function isDocsPath(pathname: string): boolean {
  return /\/docs(?:\/|$)/.test(pathname);
}

function detectCurrentPage(pathname: string): HarnessPageId {
  if (isDocsPath(pathname)) {
    return 'docs';
  }

  const file = pathname.split('/').pop() ?? 'index.html';
  switch (file) {
    case '':
    case 'index.html':
      return 'generic-demo';
    case 'hierarchy.html':
      return 'hierarchy';
    case 'scroll-sync.html':
      return 'scroll-sync';
    case 'zoom.html':
      return 'timeline-navigation';
    case 'large-dataset.html':
      return 'large-dataset';
    case 'data.html':
      return 'mutation';
    case 'editing.html':
      return 'editing';
    default:
      return 'generic-demo';
  }
}

function pageHref(page: HarnessPage, inDocs: boolean): string {
  if (inDocs) {
    return page.id === 'docs' ? './index.html' : `../${page.file}`;
  }

  return page.id === 'docs' ? './docs/' : `./${page.file}`;
}

function mountHarnessNav(nav: HTMLElement): void {
  const inDocs = isDocsPath(window.location.pathname);
  const current = detectCurrentPage(window.location.pathname);

  for (const page of HARNESS_PAGES) {
    const link = document.createElement('a');
    link.href = pageHref(page, inDocs);
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
