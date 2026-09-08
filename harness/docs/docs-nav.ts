// The docs page set, in reading order. This one list drives two things on every docs page: the
// nav bar under the harness nav, and the previous/next pager at the foot of the page. Adding a
// page is one entry here plus the page file plus an input entry in `vite.config.ts`.
//
// The empty export keeps this file a module: `harness-nav.ts` is a sibling script with names of
// its own, and two global scripts in one program would collide on them.
export {};

type DocsPageId =
  | 'overview'
  | 'api-reference'
  | 'layers'
  | 'files'
  | 'lifecycle'
  | 'classes'
  | 'timeline'
  | 'plugins'
  | 'diagram'
  | 'maintaining';

type DocsPage = {
  readonly id: DocsPageId;
  readonly label: string;
  readonly file: string;
  readonly title: string;
};

const DOCS_PAGES: readonly DocsPage[] = [
  { id: 'overview', label: 'Overview', file: 'index.html', title: 'Harness docs — overview and usage' },
  {
    id: 'api-reference',
    label: 'API reference',
    file: 'api-reference.html',
    title: 'API reference — the generated export list',
  },
  { id: 'layers', label: 'Layers', file: 'layers.html', title: 'Layer map & import rules' },
  { id: 'files', label: 'Files', file: 'files.html', title: 'File inventory' },
  { id: 'lifecycle', label: 'Lifecycle', file: 'lifecycle.html', title: 'Construction, render, notification' },
  { id: 'classes', label: 'Class map', file: 'classes.html', title: 'Class map, layer by layer' },
  { id: 'timeline', label: 'Timeline', file: 'timeline.html', title: 'How the timeline paints' },
  { id: 'plugins', label: 'Plugins', file: 'plugins.html', title: 'Plugin lifecycle' },
  { id: 'diagram', label: 'Diagrams', file: 'diagram.html', title: 'Module map diagrams' },
  { id: 'maintaining', label: 'Maintaining', file: 'maintaining.html', title: 'How to keep these pages true' },
];

function detectCurrentPage(pathname: string): DocsPageId {
  const file = pathname.split('/').pop() ?? 'index.html';
  const match = DOCS_PAGES.find((page) => page.file === file);
  return match?.id ?? 'overview';
}

function mountDocsNav(nav: HTMLElement, current: DocsPageId): void {
  for (const page of DOCS_PAGES) {
    const link = document.createElement('a');
    link.href = `./${page.file}`;
    link.textContent = page.label;
    link.title = page.title;
    if (page.id === current) {
      link.setAttribute('aria-current', 'page');
    }
    nav.append(link);
  }
}

function pagerLink(page: DocsPage, direction: 'previous' | 'next'): HTMLAnchorElement {
  const link = document.createElement('a');
  link.href = `./${page.file}`;
  link.className = `pager-${direction}`;

  const arrow = document.createElement('span');
  arrow.className = 'dir';
  arrow.textContent = direction === 'previous' ? '← previous' : 'next →';

  const name = document.createElement('span');
  name.className = 'name';
  name.textContent = page.title;

  link.append(arrow, name);
  return link;
}

function mountDocsPager(pager: HTMLElement, current: DocsPageId): void {
  const index = DOCS_PAGES.findIndex((page) => page.id === current);
  const previous = DOCS_PAGES[index - 1];
  const next = DOCS_PAGES[index + 1];

  if (previous) {
    pager.append(pagerLink(previous, 'previous'));
  }
  if (next) {
    pager.append(pagerLink(next, 'next'));
  }
}

const current = detectCurrentPage(window.location.pathname);

document.querySelectorAll<HTMLElement>('.harness-docs-nav').forEach((nav) => {
  mountDocsNav(nav, current);
});

document.querySelectorAll<HTMLElement>('.harness-docs-pager').forEach((pager) => {
  mountDocsPager(pager, current);
});
