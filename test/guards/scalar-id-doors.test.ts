// F19 (`plans/02-public-api.md`) — loose on a scalar, branded on a collection key: every id a
// caller passes one at a time takes `EntryId | string` (etc.), not a bare branded type. #305 found
// four doors that broke this by review; nothing before this guard caught it by machine. Shaped like
// `test/guards/retired-words.test.ts`: read the published surface (`etc/freegantt.api.md`, the same
// contract `pnpm api-report` freezes) and fail on a bare brand where a caller-facing parameter
// stands.
//
// Two kinds of parameter are allowed to stay branded, and both are already answered elsewhere:
//   - an Error subclass constructor never reads a caller's raw string — `data/error-reporting.ts`
//     mints the id it passes in, already branded, so there is nothing here for a plugin author to
//     widen for.
//   - the brand helpers `src/model/ids.ts` itself declares (`barId`, `entryIdOfBar`,
//     `partIndexOfBar`, …) — these convert one already-branded id into another, so their input
//     was never a loose scalar to begin with.
// A hit outside both is exactly F19's scalar half breaking again.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const API_REPORT = path.join(root, 'etc/freegantt.api.md');

const BRAND_TYPES = ['EntryId', 'RowId', 'BarId'] as const;

// `src/model/ids.ts`'s own exports — the only functions allowed to take one of `BRAND_TYPES` as a
// bare (non-loosened) parameter, because each one converts an already-branded id, never a caller's
// raw string (see the file banner above).
const IDS_MODULE_HELPERS = new Set(['barId', 'entryIdOfBar', 'partIndexOfBar', 'changeSetId']);

interface Hit {
  line: number;
  text: string;
}

/** The parameter list of one signature line, or `undefined` for a line with no `(...)` at all —
 *  which rules out every plain property declaration (`id: EntryId;`) in one step, since a property
 *  carries no parens. Every signature this guard cares about is one line in `etc/freegantt.api.md`
 *  (api-extractor's own formatting), so a first-match, same-line capture is enough. */
function parameterListOf(line: string): string | undefined {
  const match = /\(([^)]*)\)/.exec(line);
  return match?.[1];
}

/** `true` when `paramList` names one of `BRAND_TYPES` on its own — not loosened with `| string`
 *  (F19's own spelling) and not part of some wider union that already includes it. */
function hasBareBrandParam(paramList: string): boolean {
  return BRAND_TYPES.some((brand) => {
    const pattern = new RegExp(`:\\s*${brand}\\b(?!\\s*\\|)`);
    return pattern.test(paramList);
  });
}

function isAllowlisted(line: string): boolean {
  if (line.includes('constructor(')) return true;
  return [...IDS_MODULE_HELPERS].some((name) => line.includes(`${name}(`));
}

describe('F19 stays machine-checked: no bare branded id on a scalar parameter (#305)', () => {
  it('etc/freegantt.api.md names no caller-facing door taking EntryId/RowId/BarId alone', () => {
    const lines = fs.readFileSync(API_REPORT, 'utf8').split('\n');
    const hits: Hit[] = [];
    lines.forEach((line, index) => {
      const paramList = parameterListOf(line);
      if (paramList === undefined) return;
      if (!hasBareBrandParam(paramList)) return;
      if (isAllowlisted(line)) return;
      hits.push({ line: index + 1, text: line.trim() });
    });
    expect(hits, JSON.stringify(hits, null, 2)).toEqual([]);
  });
});
