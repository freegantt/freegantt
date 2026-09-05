// One selector shape, one escape. Before #165 `view/gantt-dom.ts` kept a second feature-detect whose
// fallback escaped `"` and `\` while this one returned the raw value. These tests pin the branch the
// duplicate existed for: no `CSS.escape`, and a Field key that holds a quote.

import { afterEach, describe, expect, it } from 'vitest';
import { cssEscapeAttr } from './css-escape.js';

const globals = globalThis as { CSS?: typeof CSS };
const realCss = globals.CSS;

afterEach(() => {
  if (realCss === undefined) delete globals.CSS;
  else globals.CSS = realCss;
});

describe('cssEscapeAttr', () => {
  it('delegates to `CSS.escape` where the environment has it', () => {
    globals.CSS = { escape: (value: string) => `escaped:${value}` } as typeof CSS;
    expect(cssEscapeAttr('start')).toBe('escaped:start');
  });

  it('escapes the quoted-string specials when `CSS.escape` is missing', () => {
    // The same output `CSS.escape` gives these two characters, so both branches agree.
    delete globals.CSS;
    expect(cssEscapeAttr('a"b\\c')).toBe('a\\"b\\\\c');
  });

  it('leaves an ordinary Field key alone when `CSS.escape` is missing', () => {
    delete globals.CSS;
    expect(cssEscapeAttr('start')).toBe('start');
  });
});
