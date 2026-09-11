import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// D-S5-27 (s5.11-a11y-completion.md §1): axe walks every page the harness gallery actually links,
// not every .html file on disk — harness/diagram.html sits in no nav and is not a demo. The nav's
// own HARNESS_PAGES array (harness/harness-nav.ts) is the one list, so a page a future step adds to
// the gallery is covered here by construction instead of by someone remembering to retype it.
//
// harness-nav.ts is a browser script — it queries `document` at module load — so this file cannot
// `import` it directly from Node. Reading its literal array out of the source text still derives
// the list from that one array rather than retyping it by hand, so the two files cannot drift.
const HARNESS_NAV_PATH = fileURLToPath(new URL('../harness/harness-nav.ts', import.meta.url));

function readHarnessPageFiles(): string[] {
  const source = readFileSync(HARNESS_NAV_PATH, 'utf-8');
  const arrayMatch = /const HARNESS_PAGES: readonly HarnessPage\[\] = \[([\s\S]*?)\n\];/.exec(source);
  if (!arrayMatch?.[1]) {
    throw new Error('could not find HARNESS_PAGES in harness/harness-nav.ts — has its shape changed?');
  }

  const entries = [...arrayMatch[1].matchAll(/file:\s*'([^']+)'/g)].map((match) => match[1]!);
  if (entries.length === 0) {
    throw new Error('HARNESS_PAGES parsed to zero entries — the extraction regex no longer matches');
  }

  return entries;
}

const DOCS_NAV_PATH = fileURLToPath(new URL('../harness/docs/docs-nav.ts', import.meta.url));

// `HARNESS_PAGES` names the docs folder once, by its index page, so the docs pages behind that one
// entry shipped unswept — D-S5-27 asks for every page the gallery *links*, and the docs nav links
// all of them. `docs-nav.ts` holds that second list, and it is a browser script for the same reason
// `harness-nav.ts` is, so it is read the same way: out of the source text, never retyped.
function readDocsPageFiles(): string[] {
  const source = readFileSync(DOCS_NAV_PATH, 'utf-8');
  const arrayMatch = /const DOCS_PAGES: readonly DocsPage\[\] = \[([\s\S]*?)\n\];/.exec(source);
  if (!arrayMatch?.[1]) {
    throw new Error('could not find DOCS_PAGES in harness/docs/docs-nav.ts — has its shape changed?');
  }

  const entries = [...arrayMatch[1].matchAll(/file:\s*'([^']+)'/g)].map((match) => `docs/${match[1]!}`);
  if (entries.length === 0) {
    throw new Error('DOCS_PAGES parsed to zero entries — the extraction regex no longer matches');
  }

  return entries;
}

// `docs/index.html` sits in both lists, so the set drops the duplicate rather than axing it twice.
const HARNESS_PAGE_FILES = [...new Set([...readHarnessPageFiles(), ...readDocsPageFiles()])];

// Every page but the docs index mounts at least one Gantt; the docs index is prose. Each branch
// waits for one real element so axe never inspects a page mid-render (browser-tests skill, rule 2).
async function waitForPageToSettle(page: import('@playwright/test').Page, file: string): Promise<void> {
  if (file.startsWith('docs/')) {
    await expect(page.locator('h1')).toBeVisible();
    return;
  }

  await expect(page.locator('.fg-bar').first()).toBeVisible();
}

for (const file of HARNESS_PAGE_FILES) {
  test(`[S5-A4] ${file} has no axe violations`, async ({ page }) => {
    await page.goto(`/${file}`);
    await waitForPageToSettle(page, file);

    const results = await new AxeBuilder({ page }).analyze();

    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  });
}
