import { describe, expect, it, vi } from 'vitest';
import { PluginRuntime, RegistrationGate, type ShellPlugin } from './plugin-runtime.js';
import { DisposableStore } from './disposables.js';
import { DuplicatePluginIdError, PluginSetupError, RegistrationClosedError } from '../model/index.js';

interface TestContext {
  disposables: DisposableStore;
  log: string[];
}

function makeRuntime(log: string[]) {
  return new PluginRuntime<TestContext>(() => {
    const disposables = new DisposableStore();
    return { context: { disposables, log }, disposables };
  });
}

function plugin(
  id: string,
  onSetup: (ctx: TestContext) => void,
  onDispose?: (ctx: TestContext) => void,
): ShellPlugin<TestContext> {
  let capturedCtx: TestContext | undefined;
  return {
    id,
    setup(ctx) {
      capturedCtx = ctx;
      onSetup(ctx);
      return () => onDispose?.(capturedCtx!);
    },
  };
}

describe('PluginRuntime', () => {
  it('installs and disposes a plugin whose setup returns nothing (review P4)', () => {
    const log: string[] = [];
    const runtime = makeRuntime(log);
    const quiet: ShellPlugin<TestContext> = {
      id: 'quiet',
      setup(ctx) {
        // Every registration a real plugin makes is already filed here, so it owns no resource of
        // its own and writes no disposer.
        ctx.disposables.add(() => log.push('registration retracted'));
      },
    };

    runtime.install([quiet]);
    expect(runtime.plugins.map((installed) => installed.id)).toEqual(['quiet']);

    runtime.install([]);
    expect(log).toEqual(['registration retracted']);
  });

  it('runs setup once per plugin, in list order', () => {
    const log: string[] = [];
    const runtime = makeRuntime(log);
    runtime.install([plugin('a', () => log.push('setup a')), plugin('b', () => log.push('setup b'))]);

    expect(log).toEqual(['setup a', 'setup b']);
  });

  it('runs a disposer on removal', () => {
    const log: string[] = [];
    const runtime = makeRuntime(log);
    runtime.install([
      plugin(
        'a',
        () => {},
        () => log.push('dispose a'),
      ),
    ]);

    runtime.install([]);

    expect(log).toEqual(['dispose a']);
  });

  it('assigning a list with the same ids sets nothing up again', () => {
    const log: string[] = [];
    const runtime = makeRuntime(log);
    const a = plugin('a', () => log.push('setup a'));
    runtime.install([a]);
    runtime.install([a]);

    expect(log).toEqual(['setup a']);
  });

  it('a duplicate id throws DuplicatePluginIdError', () => {
    const log: string[] = [];
    const runtime = makeRuntime(log);

    expect(() => runtime.install([plugin('a', () => {}), plugin('a', () => {})])).toThrow(
      DuplicatePluginIdError,
    );
  });

  it('disposeAll() disposes every plugin in reverse registration order', () => {
    const log: string[] = [];
    const runtime = makeRuntime(log);
    runtime.install([
      plugin(
        'a',
        () => {},
        () => log.push('dispose a'),
      ),
      plugin(
        'b',
        () => {},
        () => log.push('dispose b'),
      ),
    ]);

    runtime.disposeAll();

    expect(log).toEqual(['dispose b', 'dispose a']);
  });

  it("disposes a plugin's own ctx.disposables ahead of its returned Disposer", () => {
    const log: string[] = [];
    const runtime = makeRuntime(log);
    runtime.install([
      plugin(
        'a',
        (ctx) => ctx.disposables.add(() => log.push('ctx disposable')),
        () => log.push('own disposer'),
      ),
    ]);

    runtime.install([]);

    expect(log).toEqual(['ctx disposable', 'own disposer']);
  });

  it('a setup() throw unwinds the already-set-up plugins from that batch, in reverse, and rethrows PluginSetupError', () => {
    const log: string[] = [];
    const runtime = makeRuntime(log);

    expect(() =>
      runtime.install([
        plugin(
          'a',
          () => {},
          () => log.push('dispose a'),
        ),
        plugin('b', () => {
          throw new Error('boom');
        }),
      ]),
    ).toThrow(PluginSetupError);

    expect(log).toEqual(['dispose a']);
    expect(runtime.plugins).toEqual([]);
  });

  it('a same-batch setup() throw leaves a dropped plugin installed and undisposed, not primed for a double dispose (C1)', () => {
    const log: string[] = [];
    const runtime = makeRuntime(log);
    runtime.install([
      plugin(
        'a',
        () => {},
        () => log.push('dispose a'),
      ),
    ]);

    // `next` drops 'a' and adds a throwing 'b' in the same install() call. Atomic install() means
    // this whole call is rejected as one unit: 'a' is not disposed as a side effect of a batch that
    // never actually lands — it stays exactly as installed as it was before this call.
    expect(() =>
      runtime.install([
        plugin('b', () => {
          throw new Error('boom');
        }),
      ]),
    ).toThrow(PluginSetupError);

    expect(log).toEqual([]);
    expect(runtime.plugins.map((p) => p.id)).toEqual(['a']);

    // The bug this guards against: disposing `removed` before `toAdd`'s setup() had succeeded left
    // `#installed` still holding 'a' after the throw above (the final reassignment was skipped), so
    // this next install() disposed it a *second* time. With the fix, 'a' was never disposed above,
    // so this is its only dispose.
    runtime.install([]);

    expect(log).toEqual(['dispose a']);
    expect(runtime.plugins).toEqual([]);
  });

  it('a disposer throw is logged and disposal continues', () => {
    const log: string[] = [];
    const runtime = makeRuntime(log);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    runtime.install([
      plugin(
        'a',
        () => {},
        () => log.push('dispose a'),
      ),
      plugin(
        'b',
        () => {},
        () => {
          throw new Error('disposer boom');
        },
      ),
    ]);

    runtime.disposeAll();

    expect(log).toEqual(['dispose a']);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });

  it('a same-id, new-instance reassignment warns in dev mode', () => {
    const log: string[] = [];
    const runtime = makeRuntime(log);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    runtime.install([plugin('a', () => {})]);

    runtime.install([plugin('a', () => {})]);

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toContain('"a"');
    warnSpy.mockRestore();
  });
});

describe('RegistrationGate', () => {
  it('is open during setup and throws RegistrationClosedError once closed', () => {
    const gate = new RegistrationGate('demo.plugin');
    expect(() => gate.assertOpen()).not.toThrow();

    gate.close();

    expect(() => gate.assertOpen()).toThrow(RegistrationClosedError);
  });
});
