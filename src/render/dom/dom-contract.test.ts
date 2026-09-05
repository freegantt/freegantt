// A guard with no failing fixture is presumed broken (docs/04-hooks-and-ci.md §4).
//
// The question: can a rename inside `render/dom` change what an `e2e/` spec has to query, with
// nothing failing? Before #180 it could — the backend wrote `ROW_CLASS`/`BAR_CLASS` straight into
// `data-testid`, so renaming a class renamed the e2e contract in silence. These assertions pin the
// two strings Playwright queries, so the rename fails here first.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BAR_TESTID, ROW_TESTID, TESTID_KEY } from './dom-contract.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const e2eDir = path.join(root, 'e2e');

/** Every `[data-testid="…"]` an `e2e/` spec queries. */
function testIdsQueriedByE2e(): Set<string> {
  const found = new Set<string>();
  for (const file of fs.readdirSync(e2eDir)) {
    if (!file.endsWith('.spec.ts')) continue;
    const source = fs.readFileSync(path.join(e2eDir, file), 'utf8');
    for (const match of source.matchAll(/data-testid="([^"]+)"/g)) found.add(match[1]!);
  }
  return found;
}

describe('the e2e test-id contract', () => {
  it('names the dataset key `HTMLElement.dataset` writes as `data-testid`', () => {
    const node = document.createElement('div');
    node.dataset[TESTID_KEY] = ROW_TESTID;
    expect(node.getAttribute('data-testid')).toBe(ROW_TESTID);
  });

  it('holds the exact strings the specs pin', () => {
    expect(ROW_TESTID).toBe('fg-row');
    expect(BAR_TESTID).toBe('fg-bar');
  });

  it('declares every test id the e2e specs query', () => {
    const declared = new Set([ROW_TESTID, BAR_TESTID]);
    const queried = testIdsQueriedByE2e();
    // Guards the reader itself: a spec rewrite that stops matching would make this vacuous.
    expect(queried.size).toBeGreaterThan(0);
    for (const id of queried) expect([...declared]).toContain(id);
  });
});
