// Every page in `docs/architecture/` says when it was last made true, in `last_update.date` front
// matter (`docs/architecture/maintaining.md`, "Mechanics of the pages"). The instruction was there
// for months and no page carried the key, so `showLastUpdateTime` printed each page's last commit
// date instead — a date that moves for a typo fix as readily as for a re-derivation, and that reads
// as a freshness claim nobody made.
//
// This test holds the key present and well formed. It cannot know whether the writer really re-read
// the code that day; nothing can. It does refuse the three ways the date stops meaning anything: an
// absent key, a date the site cannot parse, and a date in the future.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const architectureDir = path.join(root, 'docs/architecture');

/** The page's leading `---` block, and nothing after it — a `last_update:` written in the prose
 *  below is not front matter and must not answer for one. */
const FRONT_MATTER = /^---\n([\s\S]*?)\n---\n/;

/** `last_update:` then an indented `date:` on the next line. */
const LAST_UPDATE_DATE = /^last_update:\n\s+date:\s*(\S+)\s*$/m;

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function pages(): readonly string[] {
  return fs
    .readdirSync(architectureDir)
    .filter((name) => name.endsWith('.md'))
    .sort();
}

/** The date the page states, or `undefined` when it states none. */
function statedDate(name: string): string | undefined {
  const page = fs.readFileSync(path.join(architectureDir, name), 'utf8');
  const frontMatter = FRONT_MATTER.exec(page)?.[1];
  if (frontMatter === undefined) return undefined;
  return LAST_UPDATE_DATE.exec(frontMatter)?.[1];
}

describe('every architecture page says when it was last made true', () => {
  it('finds pages to check', () => {
    expect(pages().length).toBeGreaterThan(0);
  });

  it.each(pages())('%s states a last_update.date', (name) => {
    expect(statedDate(name), `${name} has no last_update.date in its front matter`).toBeDefined();
  });

  it.each(pages())('%s states it as YYYY-MM-DD, and not in the future', (name) => {
    const date = statedDate(name);
    expect(date, `${name} has no last_update.date in its front matter`).toBeDefined();
    expect(date, `${name}: "${date}" is not a YYYY-MM-DD day`).toMatch(ISO_DAY);

    const stated = new Date(`${date}T00:00:00Z`);
    expect(Number.isNaN(stated.getTime()), `${name}: "${date}" is not a real day`).toBe(false);
    expect(stated.getTime(), `${name}: "${date}" has not happened yet`).toBeLessThanOrEqual(Date.now());
  });
});
