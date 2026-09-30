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

/** A build can ship some of the demo pages. `VITE_HARNESS_PAGES=generic-demo,performance` keeps
 *  those two in the nav. Unset, every page shows, as in `pnpm dev`. */
function shippedPages(): readonly HarnessPage[] {
  const ids = (import.meta as { env?: { VITE_HARNESS_PAGES?: string } }).env?.VITE_HARNESS_PAGES;
  if (!ids) return HARNESS_PAGES;
  const shipped = ids.split(',');
  return HARNESS_PAGES.filter((page) => shipped.includes(page.id));
}

/** The demo page `pathname` points at. The site root serves `index.html`. */
function currentPageFile(pathname: string): string {
  return pathname.split('/').pop() || 'index.html';
}

/** A build can link the demo back to the site that hosts it: `VITE_HARNESS_HOME_URL=/`. Unset, the
 *  nav shows no such link, as in `pnpm dev`. */
function mountHomeLink(nav: HTMLElement): void {
  const url = (import.meta as { env?: { VITE_HARNESS_HOME_URL?: string } }).env?.VITE_HARNESS_HOME_URL;
  if (!url) return;
  const link = document.createElement('a');
  link.href = url;
  link.textContent = '← FreeGantt site';
  nav.append(link);
}

function mountHarnessNav(nav: HTMLElement): void {
  const current = currentPageFile(window.location.pathname);
  mountHomeLink(nav);
  for (const page of shippedPages()) {
    const link = document.createElement('a');
    link.href = `./${page.file}`;
    link.textContent = page.label;
    if (page.file === current) link.setAttribute('aria-current', 'page');
    nav.append(link);
  }
}

/** Fills every page header: where the reader can go, and which theme paints the page. Each page
 *  calls this once. A bare import would not do: a production build drops a module nothing uses. */
export function mountHarnessChrome(): void {
  document.querySelectorAll<HTMLElement>('.harness-site-nav').forEach(mountHarnessNav);
  document.querySelectorAll<HTMLElement>('.harness-theme-picker').forEach(mountThemePicker);
}
