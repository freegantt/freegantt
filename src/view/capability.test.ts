import { describe, expect, it } from 'vitest';
import { resolveCapabilities } from './capability.js';
import type { Entry } from '../model/index.js';
import { entryId, segmentId } from '../model/index.js';

function entry(overrides: Partial<Entry> = {}): Entry {
  const start = 0 as Entry['start'];
  const end = 1 as Entry['end'];
  return {
    id: entryId('e1'),
    kind: 'span',
    name: 'e1',
    start,
    end,
    segments: [{ id: segmentId('e1-1'), start, end }],
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

  it('defaults a rollUpKinds kind to move/resize false, select true', () => {
    const caps = resolveCapabilities(undefined, isGroup);
    const e = entry({ kind: 'group' });
    expect(caps.can('move', e)).toBe(false);
    expect(caps.can('resize', e)).toBe(false);
    expect(caps.can('select', e)).toBe(true);
  });

  it('defaults edit true for every kind, including a roll-up kind (S5.8, D-S5-19)', () => {
    const caps = resolveCapabilities(undefined, isGroup);
    expect(caps.can('edit', entry({ kind: 'group' }))).toBe(true);
    expect(caps.can('edit', entry({ kind: 'span' }))).toBe(true);
    expect(caps.can('edit', entry({ kind: 'milestone' }))).toBe(true);
  });

  it('an explicit edit rule overrides the default', () => {
    const caps = resolveCapabilities({ edit: false }, isNeverDerived);
    expect(caps.can('edit', entry())).toBe(false);
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

  describe('registered kind defaults (S5.9, D-S5-22)', () => {
    it('a registered default answers a kind the library table would otherwise resolve', () => {
      const caps = resolveCapabilities(undefined, isNeverDerived, (kind) =>
        kind === 'buffer' ? { resize: false } : undefined,
      );
      expect(caps.can('resize', entry({ kind: 'buffer' }))).toBe(false);
      expect(caps.can('move', entry({ kind: 'buffer' }))).toBe(true);
    });

    it("the consumer's own interactions still wins over a registered default", () => {
      const caps = resolveCapabilities({ resize: true }, isNeverDerived, (kind) =>
        kind === 'buffer' ? { resize: false } : undefined,
      );
      expect(caps.can('resize', entry({ kind: 'buffer' }))).toBe(true);
    });

    it('a registered default still loses to the consumer for an unrelated kind — the library table applies instead', () => {
      const caps = resolveCapabilities(undefined, isGroup, (kind) =>
        kind === 'buffer' ? { resize: false } : undefined,
      );
      expect(caps.can('resize', entry({ kind: 'group' }))).toBe(false);
    });

    it('an unregistered kind falls straight through to the library table', () => {
      const caps = resolveCapabilities(undefined, isNeverDerived, () => undefined);
      expect(caps.can('resize', entry({ kind: 'span' }))).toBe(true);
    });
  });
});
