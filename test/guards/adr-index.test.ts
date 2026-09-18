// `docs/adr/README.md`'s index table is the only place a reader learns whether an ADR still holds,
// or which later record superseded or amended it (`docs/adr/README.md` §Index). Nothing checked
// that the table stayed in step with the files on disk, so a new ADR could ship with no row, or a
// row could go on citing a file long after it was renamed or deleted — a stale index is worse than
// none (#421 C9a, D2).
//
// So the claim becomes a test, the same shape `file-inventory.test.ts` already uses for
// `docs/architecture/files.md`: every `docs/adr/NNNN-*.md` file has a row, and every row names a
// file that exists. `0014` is the one deliberate gap (`docs/adr/README.md#the-gap-at-0014`) and is
// excluded on both sides.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const adrDir = path.join(root, 'docs/adr');
const indexPage = path.join(adrDir, 'README.md');

/** A numbered record file on disk, e.g. `0012-dates-are-optional-on-every-kind.md` -> `0012`. */
const ADR_FILENAME = /^(\d{4})-.+\.md$/;

/** A row in the index table opens with `| [NNNN](NNNN-slug.md) |`. */
const ROW = /^\| \[(\d{4})\]\(([^)]+)\) \|/gm;

/** Every ADR number the index table cites, paired with the file it links to. */
function rowsOnIndexPage(): ReadonlyArray<{ readonly number: string; readonly file: string }> {
  const page = fs.readFileSync(indexPage, 'utf8');
  return [...page.matchAll(ROW)].map((match) => ({
    number: match[1] as string,
    file: match[2] as string,
  }));
}

/** Every numbered ADR file on disk, `0014` excluded — it was withdrawn before build and the
 *  number is deliberately not reused (`docs/adr/README.md#the-gap-at-0014`). */
function adrNumbersOnDisk(): readonly string[] {
  return fs
    .readdirSync(adrDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name.match(ADR_FILENAME))
    .filter((match): match is RegExpMatchArray => match !== null)
    .map((match) => match[1] as string)
    .filter((number) => number !== '0014')
    .sort();
}

describe('the ADR index table names every record, and only records that exist', () => {
  it('has a row for every ADR file on disk', () => {
    const indexed = new Set(rowsOnIndexPage().map((row) => row.number));
    const missing = adrNumbersOnDisk().filter((number) => !indexed.has(number));
    expect(missing).toEqual([]);
  });

  it('names no row for an ADR file that does not exist', () => {
    const onDisk = new Set(adrNumbersOnDisk());
    const stale = rowsOnIndexPage()
      .map((row) => row.number)
      .filter((number) => !onDisk.has(number));
    expect(stale).toEqual([]);
  });

  it('links every row to a file that exists', () => {
    const brokenLinks = rowsOnIndexPage().filter((row) => !fs.existsSync(path.join(adrDir, row.file)));
    expect(brokenLinks).toEqual([]);
  });

  it('reads the page as rows, not as a word search', () => {
    // The row shape is the contract. An ADR number mentioned mid-sentence (there are dozens) is not
    // a row, and counting those would let the guard pass while the table lists nothing.
    expect(rowsOnIndexPage().length).toBeGreaterThan(20);
  });
});
