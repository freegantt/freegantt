// render/dom — text-ruler.ts's own contract: canvas measureText when a 2d context exists, undefined
// (never a thrown error, never an invented number) when jsdom's canvas has none.

import { describe, expect, it } from 'vitest';
import { createTextRuler } from './text-ruler.js';

describe('createTextRuler', () => {
  it('reads undefined with no 2d context, the stub environment this suite runs in (J1)', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const ruler = createTextRuler(host);
    expect(ruler.widthOf('Discovery phase')).toBeUndefined();
    host.remove();
  });

  it('reads a number once a 2d context is available', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const original = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'getContext');
    // A minimal stand-in for jsdom's own missing canvas backend, this test's only job.
    const stubGetContext = (kind: string): unknown => {
      if (kind !== '2d') return null;
      return { font: '', measureText: (text: string) => ({ width: text.length * 6 }) };
    };
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      value: stubGetContext,
      configurable: true,
    });
    try {
      const ruler = createTextRuler(host);
      expect(ruler.widthOf('abc')).toBe(18);
    } finally {
      if (original) Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', original);
      host.remove();
    }
  });
});
