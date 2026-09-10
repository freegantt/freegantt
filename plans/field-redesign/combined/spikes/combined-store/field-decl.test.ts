import { describe, expect, it } from 'vitest';
import { IllegalCoreFieldOverrideError } from './errors.js';
import { parseFieldDecls } from './lock.js';

describe('field declaration shapes — Q16', () => {
  it('{ key: start, editable: false } constructs', () => {
    const { coreOverrides } = parseFieldDecls([{ key: 'start', editable: false }]);
    expect(coreOverrides.get('start')).toBe(false);
  });

  it('{ key: start } is a no-op', () => {
    const { coreOverrides } = parseFieldDecls([{ key: 'start' }]);
    expect(coreOverrides.has('start')).toBe(false);
  });

  it('{ key: start, column } throws', () => {
    expect(() =>
      parseFieldDecls([{ key: 'start', editable: false, column: { width: 80 } } as never]),
    ).toThrow(IllegalCoreFieldOverrideError);
  });
});
