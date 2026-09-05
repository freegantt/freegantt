import { describe, expect, it, vi } from 'vitest';
import { installDatasetPlugins, resolveSetupOrder } from './install-dataset-plugins.js';
import type { OrderedPlugin } from './install-dataset-plugins.js';
import { DisposableStore } from './disposables.js';
import { RegistrationGate } from './plugin-runtime.js';
import {
  DuplicatePluginIdError,
  MissingPluginError,
  PluginRequirementCycleError,
  PluginSetupError,
  RegistrationClosedError,
} from '../model/index.js';
import type { ErrorReportInput, RaiseError } from '../model/index.js';
import type { Disposer, PluginId } from '../model/index.js';

interface TestContext {
  pluginId: PluginId;
  disposables: DisposableStore;
  log: string[];
}

/** One plugin that writes its own id to the shared log as it sets up and as it disposes. */
function plugin(
  id: PluginId,
  options: { requires?: readonly PluginId[]; setup?: (ctx: TestContext) => Disposer | void } = {},
): OrderedPlugin<TestContext> {
  return {
    id,
    ...(options.requires ? { requires: options.requires } : {}),
    setup(ctx) {
      ctx.log.push(`setup ${id}`);
      return options.setup?.(ctx) ?? (() => ctx.log.push(`dispose ${id}`));
    },
  };
}

/** S5.12: no bus behind this raiser, so every report falls straight through to the site's own
 *  `console` line. That is the behaviour the assertions below already read. */
const consoleOnly: RaiseError = (_report, fallback) => fallback?.();

/** Mirrors `api/dataset.ts`'s composition root: one context, one disposable store and one gate per
 *  plugin. The gate is kept, so a test can prove installation closed it. */

function installer(
  log: string[],
  raiseError: RaiseError = consoleOnly,
): {
  install: (plugins: readonly OrderedPlugin<TestContext>[]) => Disposer;
  gateOf: (pluginId: PluginId) => RegistrationGate | undefined;
} {
  const gates = new Map<PluginId, RegistrationGate>();
  return {
    install: (plugins) =>
      installDatasetPlugins(plugins, raiseError, (pluginId) => {
        const disposables = new DisposableStore();
        const registrationGate = new RegistrationGate(pluginId);
        gates.set(pluginId, registrationGate);
        return { context: { pluginId, disposables, log }, disposables, registrationGate };
      }),
    gateOf: (pluginId) => gates.get(pluginId),
  };
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

describe('installDatasetPlugins', () => {
  it('installs in resolved order and disposes in reverse', () => {
    const log: string[] = [];
    const dispose = installer(log).install([plugin('b', { requires: ['a'] }), plugin('a')]);
    expect(log).toEqual(['setup a', 'setup b']);

    dispose();
    expect(log).toEqual(['setup a', 'setup b', 'dispose b', 'dispose a']);
  });

  it('disposes only once, however many times the returned disposer is called', () => {
    const log: string[] = [];
    const dispose = installer(log).install([plugin('a')]);
    dispose();
    dispose();
    expect(log.filter((line) => line === 'dispose a')).toHaveLength(1);
  });

  it('retracts a plugin own registrations before running its disposer', () => {
    const log: string[] = [];
    const dispose = installer(log).install([
      plugin('a', {
        setup: (ctx) => {
          ctx.disposables.add(() => log.push('registration retracted'));
        },
      }),
    ]);
    dispose();
    expect(log).toEqual(['setup a', 'registration retracted', 'dispose a']);
  });

  it('a throwing disposer raises one report and disposal continues (D-S5-35)', () => {
    const log: string[] = [];
    const reported: ErrorReportInput[] = [];
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const dispose = installer(log, (report) => reported.push(report)).install([
      plugin('a'),
      plugin('b', {
        setup: () => () => {
          throw new Error('disposer boom');
        },
      }),
    ]);

    dispose();

    expect(log).toEqual(['setup a', 'setup b', 'dispose a']);
    expect(reported).toHaveLength(1);
    expect(reported[0]?.code).toBe('disposer-failed');
    expect(reported[0]?.severity).toBe('error');
    expect(reported[0]?.by).toBe('b');
    // The console line is a fallback, so a raiser that keeps the report prints nothing.
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('closes the registration gate the moment setup returns (D-S5-4)', () => {
    const log: string[] = [];
    const { install, gateOf } = installer(log);
    install([plugin('a')]);
    expect(() => gateOf('a')?.assertOpen()).toThrow(RegistrationClosedError);
  });

  it('rejects one id installed twice', () => {
    expect(() => installer([]).install([plugin('a'), plugin('a')])).toThrow(DuplicatePluginIdError);
  });

  it('unwinds this batch when a setup throws, so no half-installed Dataset reaches a caller', () => {
    const log: string[] = [];
    const boom = plugin('b', {
      setup: () => {
        throw new Error('no');
      },
    });
    let error: unknown;
    try {
      installer(log).install([plugin('a'), boom]);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(PluginSetupError);
    expect((error as PluginSetupError).pluginId).toBe('b');
    expect(log).toEqual(['setup a', 'setup b', 'dispose a']);
  });
});
