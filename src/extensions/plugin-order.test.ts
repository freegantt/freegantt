import { describe, expect, it } from 'vitest';
import { resolveSetupOrder } from './plugin-order.js';
import { MissingPluginError, PluginRequirementCycleError } from '../model/index.js';
import type { PluginId } from '../model/index.js';

/** The two members the sort reads, and nothing else (ADR 0019: one `requires` list covers both
 *  halves, so this sort never names a half). */
function plugin(
  id: PluginId,
  options: { requires?: readonly PluginId[] } = {},
): {
  id: PluginId;
  requires?: readonly PluginId[];
} {
  return { id, ...(options.requires ? { requires: options.requires } : {}) };
}

describe('resolveSetupOrder (D-S5-31)', () => {
  it('sets up a required plugin first, whichever order the array writes', () => {
    const a = plugin('a');
    const b = plugin('b', { requires: ['a'] });
    expect(resolveSetupOrder([b, a]).map((p) => p.id)).toEqual(['a', 'b']);
    expect(resolveSetupOrder([a, b]).map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('keeps the array order between plugins that require nothing of each other', () => {
    expect(resolveSetupOrder([plugin('b'), plugin('a')]).map((p) => p.id)).toEqual(['b', 'a']);
  });

  it('resolves a chain of requirements before its dependents', () => {
    const engine = plugin('engine', { requires: ['links'] });
    const links = plugin('links', { requires: ['calendar'] });
    const calendar = plugin('calendar');
    expect(resolveSetupOrder([engine, links, calendar]).map((p) => p.id)).toEqual([
      'calendar',
      'links',
      'engine',
    ]);
  });

  it('throws MissingPluginError naming both ids when a prerequisite is absent', () => {
    const thrown = (): unknown => resolveSetupOrder([plugin('engine', { requires: ['links'] })]);
    expect(thrown).toThrow(MissingPluginError);
    expect(thrown).toThrow(/"engine" requires "links"/);
  });

  it('throws PluginRequirementCycleError naming every plugin in the cycle', () => {
    const a = plugin('a', { requires: ['b'] });
    const b = plugin('b', { requires: ['a'] });
    let error: unknown;
    try {
      resolveSetupOrder([a, b]);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(PluginRequirementCycleError);
    expect((error as PluginRequirementCycleError).pluginIds).toEqual(['a', 'b', 'a']);
  });
});
