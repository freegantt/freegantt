// The site header every demo page shares: where the reader can go, and which theme paints the page.
// `harness/docs/page-brief.ts` reads the page id too — one page identifies itself with the same value
// both modules key on, so a page's nav entry and its feature note never drift apart.
//
// Pages under `harness/e2e/` are test fixtures, not demos. The nav never links them.

import { mountThemePicker } from './page-theme.js';

export type HarnessPageId =
  'planner' | 'generic-demo' | 'editing-and-data' | 'hierarchy-and-timeline' | 'performance';

interface HarnessPage {
  readonly id: HarnessPageId;
  readonly label: string;
  readonly file: string;
}

const HARNESS_PAGES: readonly HarnessPage[] = [
  { id: 'planner', label: 'Planner', file: 'index.html' },
  { id: 'generic-demo', label: 'Generic demo', file: 'generic.html' },
  { id: 'editing-and-data', label: 'Editing & data', file: 'editing-and-data.html' },
  { id: 'hierarchy-and-timeline', label: 'Hierarchy & timeline', file: 'hierarchy-and-timeline.html' },
  { id: 'performance', label: 'Performance', file: 'performance.html' },
];

/** The demo page `pathname` points at. The site root serves `index.html`. */
function currentPageFile(pathname: string): string {
  return pathname.split('/').pop() || 'index.html';
}

function mountHarnessNav(nav: HTMLElement): void {
  const current = currentPageFile(window.location.pathname);
  for (const page of HARNESS_PAGES) {
    const link = document.createElement('a');
    link.href = `./${page.file}`;
    link.textContent = page.label;
    if (page.file === current) link.setAttribute('aria-current', 'page');
    nav.append(link);
  }
}

// Where can the reader go?
document.querySelectorAll<HTMLElement>('.harness-site-nav').forEach(mountHarnessNav);
// Which theme paints the page?
document.querySelectorAll<HTMLElement>('.harness-theme-picker').forEach(mountThemePicker);
