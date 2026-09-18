import { describe, expect, it } from 'vitest';
import { mergeBarLabels } from './renderer.js';

// `mergeBarLabels` is the merge `#421 C5` documents at its own call site
// (`mergeBarLabels(gantt.barLabels, variantFor(entry).barLabels)`): a variant that names only one
// key never drops the Gantt's own answer for the other.

describe('mergeBarLabels', () => {
  it('a variant naming only policy keeps the Gantt field', () => {
    const merged = mergeBarLabels({ field: 'hours' }, { policy: 'outside' });
    expect(merged).toEqual({ field: 'hours', policy: 'outside' });
  });

  it('a variant naming only field keeps the Gantt policy', () => {
    const merged = mergeBarLabels({ policy: 'outside' }, { field: 'hours' });
    expect(merged).toEqual({ field: 'hours', policy: 'outside' });
  });

  it('a variant naming both wins on both', () => {
    const merged = mergeBarLabels({ field: 'name', policy: 'inside' }, { field: 'hours', policy: 'outside' });
    expect(merged).toEqual({ field: 'hours', policy: 'outside' });
  });

  it('a variant naming neither inherits the Gantt whole answer', () => {
    const merged = mergeBarLabels({ field: 'hours', policy: 'outside' }, undefined);
    expect(merged).toEqual({ field: 'hours', policy: 'outside' });
  });

  it('the string shorthand on the Gantt merges against the object long form on the variant', () => {
    const merged = mergeBarLabels('outside', { field: 'hours' });
    expect(merged).toEqual({ field: 'hours', policy: 'outside' });
  });

  it('the string shorthand on the variant merges against the object long form on the Gantt', () => {
    const merged = mergeBarLabels({ field: 'hours', policy: 'inside' }, 'outside');
    expect(merged).toEqual({ field: 'hours', policy: 'outside' });
  });

  it('a Gantt with no barLabels at all falls back to the library defaults', () => {
    const merged = mergeBarLabels({}, undefined);
    expect(merged).toEqual({ field: 'name', policy: 'fitBar' });
  });
});
