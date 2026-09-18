import { describe, expect, it } from 'vitest';
import { mergeBarLabels } from './renderer.js';

// `mergeBarLabels` is the merge `#421 C5` documents at its own call site
// (`mergeBarLabels(gantt.barLabels, variantFor(entry).barLabels)`): a variant that names only one
// key never drops the Gantt's own answer for the other.

describe('mergeBarLabels', () => {
  it('a variant naming only placement keeps the Gantt field', () => {
    const merged = mergeBarLabels({ field: 'hours' }, { placement: 'outside' });
    expect(merged).toEqual({ field: 'hours', placement: 'outside' });
  });

  it('a variant naming only field keeps the Gantt placement', () => {
    const merged = mergeBarLabels({ placement: 'outside' }, { field: 'hours' });
    expect(merged).toEqual({ field: 'hours', placement: 'outside' });
  });

  it('a variant naming both wins on both', () => {
    const merged = mergeBarLabels(
      { field: 'name', placement: 'inside' },
      { field: 'hours', placement: 'outside' },
    );
    expect(merged).toEqual({ field: 'hours', placement: 'outside' });
  });

  it('a variant naming neither inherits the Gantt whole answer', () => {
    const merged = mergeBarLabels({ field: 'hours', placement: 'outside' }, undefined);
    expect(merged).toEqual({ field: 'hours', placement: 'outside' });
  });

  it('the string shorthand on the Gantt merges against the object long form on the variant', () => {
    const merged = mergeBarLabels('outside', { field: 'hours' });
    expect(merged).toEqual({ field: 'hours', placement: 'outside' });
  });

  it('the string shorthand on the variant merges against the object long form on the Gantt', () => {
    const merged = mergeBarLabels({ field: 'hours', placement: 'inside' }, 'outside');
    expect(merged).toEqual({ field: 'hours', placement: 'outside' });
  });

  it('a Gantt with no barLabels at all falls back to the library defaults', () => {
    const merged = mergeBarLabels({}, undefined);
    expect(merged).toEqual({ field: 'name', placement: 'fitBar' });
  });
});
