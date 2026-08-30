import { describe, expect, it } from 'vitest';
import { resolveCapabilities } from './capability.js';
import type { Entry } from '../model/index.js';
import { entryId } from '../model/index.js';

function entry(overrides: Partial<Entry> = {}): Entry {
  return {
    id: entryId('e1'),
    kind: 'span',
    name: 'e1',
    start: 0 as Entry['start'],
    end: 1 as Entry['end'],
    ...overrides,
  };
}

const isGroup = (kind: string) => kind === 'group';
const isNeverDerived = () => false;

describe('resolveCapabilities', () => {
  it('defaults a span entry to move/resize/select all true', () => {
    const caps = resolveCapabilities(undefined, isNeverDerived);
    const e = entry({ kind: 'span' });
    expect(caps.can('move', e)).toBe(true);
    expect(caps.can('resize', e)).toBe(true);
    expect(caps.can('select', e)).toBe(true);
  });

  it('defaults a milestone to move/select true, resize false', () => {
    const caps = resolveCapabilities(undefined, isNeverDerived);
    const e = entry({ kind: 'milestone' });
    expect(caps.can('move', e)).toBe(true);
    expect(caps.can('resize', e)).toBe(false);
    expect(caps.can('select', e)).toBe(true);
  });

  it('defaults a derivedSpanKinds kind to move/resize false, select true', () => {
    const caps = resolveCapabilities(undefined, isGroup);
    const e = entry({ kind: 'group' });
    expect(caps.can('move', e)).toBe(false);
    expect(caps.can('resize', e)).toBe(false);
    expect(caps.can('select', e)).toBe(true);
  });

  it('defaults a consumer-defined kind the same as span', () => {
    const caps = resolveCapabilities(undefined, isGroup);
    const e = entry({ kind: 'phase' });
    expect(caps.can('move', e)).toBe(true);
    expect(caps.can('resize', e)).toBe(true);
    expect(caps.can('select', e)).toBe(true);
  });

  it('a boolean rule overrides every kind uniformly', () => {
    const caps = resolveCapabilities({ resize: false }, isNeverDerived);
    expect(caps.can('resize', entry({ kind: 'span' }))).toBe(false);
    expect(caps.can('move', entry({ kind: 'span' }))).toBe(true);
  });

  it('a predicate rule is evaluated per entry (U4)', () => {
    const caps = resolveCapabilities({ resize: (e) => e.kind !== 'group' }, isNeverDerived);
    expect(caps.can('resize', entry({ kind: 'group' }))).toBe(false);
    expect(caps.can('resize', entry({ kind: 'span' }))).toBe(true);
  });

  it('re-resolves live: a fresh call with new interactions sees the new rule', () => {
    let caps = resolveCapabilities(undefined, isNeverDerived);
    expect(caps.can('select', entry())).toBe(true);
    caps = resolveCapabilities({ select: false }, isNeverDerived);
    expect(caps.can('select', entry())).toBe(false);
  });
});
