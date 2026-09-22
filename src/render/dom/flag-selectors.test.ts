// A guard with no failing fixture is presumed broken (docs/04-hooks-and-ci.md §4).
//
// The question: does every `BarFlags`/`LinkFlags` key have a documented selector? An interface has
// no runtime keys, so nothing but this test could catch a key that ships with no doc row —
// `LinkFlags.inactive` shipped undocumented once already (#475).
//
// `data-state` (`hovered`, `selected`, `pending`, `dragging`, `ghost`, …) is a separate attribute,
// a string union, not a flag-key set. It is out of scope for this guard.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BAR_FLAG_KEYS, LINK_FLAG_KEYS } from '../../layout/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const consumerApiDoc = fs.readFileSync(path.join(root, 'docs/05-consumer-api.md'), 'utf8');

/** Fails with a next-step, not just a mismatch: name the row to add and where. */
function expectSelectorDocumented(part: '.fg-bar' | '.fg-link', key: string): void {
  const selector = `${part}[data-flag~="${key}"]`;
  const documented = consumerApiDoc.includes(selector);
  expect(documented, `add a "${selector}" row to the data-flag table in docs/05-consumer-api.md`).toBe(true);
}

describe('the data-flag doc contract', () => {
  it('lists every BAR_FLAG_KEYS key as a .fg-bar selector', () => {
    for (const key of BAR_FLAG_KEYS) expectSelectorDocumented('.fg-bar', key);
  });

  it('lists every LINK_FLAG_KEYS key as a .fg-link selector', () => {
    for (const key of LINK_FLAG_KEYS) expectSelectorDocumented('.fg-link', key);
  });
});
