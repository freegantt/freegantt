import { describe, expect, it } from 'vitest';
import { resolveTodayHighlight } from './today-highlight.js';

describe('resolveTodayHighlight', () => {
  it('reads true as the underBars layer', () => {
    expect(resolveTodayHighlight(true)).toEqual({ layer: 'underBars' });
  });

  it('keeps false as false', () => {
    expect(resolveTodayHighlight(false)).toBe(false);
  });

  it('keeps the layer the caller names', () => {
    expect(resolveTodayHighlight({ layer: 'overBars' })).toEqual({ layer: 'overBars' });
  });
});
