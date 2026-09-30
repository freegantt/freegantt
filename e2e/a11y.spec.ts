import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// s5.11-a11y-completion.md §1: axe walks every demo page the harness nav actually links,
// not every .html file on disk — the e2e fixtures under `harness/e2e/` are not demos. The nav's own HARNESS_PAGES array (harness/harness-nav.ts) is the
// one list, so a page a future step adds to the gallery is covered here by construction instead of
// by someone remembering to retype it.
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

const HARNESS_PAGE_FILES = readHarnessPageFiles();

// Every harness page mounts at least one Gantt. Waiting for one real element means axe never
// inspects a page mid-render (browser-tests skill, rule 2).
async function waitForPageToSettle(page: import('@playwright/test').Page): Promise<void> {
  await expect(page.locator('.fg-bar').first()).toBeVisible();
}

// Every demo page paints the whole page from one theme (`harness/page-theme.ts`), so axe checks each
// theme the picker offers. Contrast that holds in Light and breaks in Dark is still a failure.
const PAGE_THEMES = ['light', 'dark', 'paper'] as const;

for (const file of HARNESS_PAGE_FILES) {
  for (const theme of PAGE_THEMES) {
    test(`[S5-A4] ${file} has no axe violations in the ${theme} theme`, async ({ page }) => {
      await page.addInitScript((choice) => localStorage.setItem('freegantt-harness-theme', choice), theme);
      await page.goto(`/${file}`);
      await waitForPageToSettle(page);

      const results = await new AxeBuilder({ page }).analyze();

      expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
    });
  }
}

// Fixture pages that no nav link reaches still owe the same run. The toggle page is one: its cells
// and headers carry names the library writes, so axe checks that they form a valid grid.
const FIXTURE_PAGE_FILES = ['e2e/toggle-column.html'];

for (const file of FIXTURE_PAGE_FILES) {
  test(`${file} has no axe violations`, async ({ page }) => {
    await page.goto(`/${file}`);
    await waitForPageToSettle(page);

    const results = await new AxeBuilder({ page }).analyze();

    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  });
}
