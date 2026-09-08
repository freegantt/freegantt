import { describe, expect, it } from 'vitest';
import { CommandRegistry } from './commands.js';
import type { Command, CommandContext } from './commands.js';
import { UnknownCommandError } from '../model/index.js';

function makeRegistry(entry?: { id: string }): {
  registry: CommandRegistry<string>;
  ctx: CommandContext<string>;
} {
  const ctx = {
    dataset: {} as CommandContext<string>['dataset'],
    gantt: 'the-gantt',
    entry,
  } as CommandContext<string>;
  return { registry: new CommandRegistry<string>(() => ctx), ctx };
}

describe('CommandRegistry (S5.2, D-S5-6)', () => {
  it('run() on an unknown id throws UnknownCommandError', () => {
    const { registry } = makeRegistry();
    expect(() => registry.run('freegantt.nope')).toThrow(UnknownCommandError);
  });

  it('available() filters by when', () => {
    const { registry, ctx } = makeRegistry();
    const always: Command<string> = { id: 'always', label: 'Always', run: () => {} };
    const never: Command<string> = { id: 'never', label: 'Never', when: () => false, run: () => {} };
    registry.register(always);
    registry.register(never);

    expect(registry.available(ctx)).toEqual([always]);
  });

  it("a command's run() gets the entry the invocation targeted", () => {
    const { registry } = makeRegistry({ id: 'e1' });
    let seen: { id: string } | undefined;
    registry.register({
      id: 'freegantt.demo',
      label: 'Demo',
      run: (ctx) => {
        seen = ctx.entry;
      },
    });

    registry.run('freegantt.demo');

    expect(seen).toEqual({ id: 'e1' });
  });

  it('run() on a command whose when declines is a silent no-op', () => {
    const { registry } = makeRegistry();
    let ran = false;
    registry.register({
      id: 'freegantt.demo',
      label: 'Demo',
      when: () => false,
      run: () => {
        ran = true;
      },
    });

    expect(() => registry.run('freegantt.demo')).not.toThrow();
    expect(ran).toBe(false);
  });

  it('register() replaces a command registered under the same id', () => {
    const { registry } = makeRegistry();
    const log: string[] = [];
    registry.register({ id: 'freegantt.demo', label: 'Demo', run: () => log.push('first') });
    registry.register({ id: 'freegantt.demo', label: 'Demo', run: () => log.push('second') });

    registry.run('freegantt.demo');

    expect(log).toEqual(['second']);
  });

  it('register() returns a Disposer; the command underneath answers again (#155)', () => {
    const { registry } = makeRegistry();
    const log: string[] = [];
    registry.register({ id: 'freegantt.demo', label: 'Core', run: () => log.push('core') });
    const dropOverride = registry.register({
      id: 'freegantt.demo',
      label: 'Plugin',
      run: () => log.push('plugin'),
    });

    registry.run('freegantt.demo');
    dropOverride();
    registry.run('freegantt.demo');
    dropOverride(); // idempotent — the store disposes it a second time on plugin teardown
    registry.run('freegantt.demo');

    expect(log).toEqual(['plugin', 'core', 'core']);
  });

  it('disposing the older registration leaves the newer one answering, in any order (#155)', () => {
    const { registry } = makeRegistry();
    const log: string[] = [];
    const dropFirst = registry.register({
      id: 'freegantt.demo',
      label: 'A',
      run: () => log.push('a'),
    });
    registry.register({ id: 'freegantt.demo', label: 'B', run: () => log.push('b') });

    dropFirst();
    registry.run('freegantt.demo');

    expect(log).toEqual(['b']);
  });

  it('disposing the last registration on an id leaves nothing to run (#155)', () => {
    const { registry } = makeRegistry();
    const drop = registry.register({ id: 'freegantt.demo', label: 'Demo', run: () => {} });

    drop();

    expect(() => registry.run('freegantt.demo')).toThrow(UnknownCommandError);
  });

  it('available() lists one command per id — the winning registration (#155)', () => {
    const { registry } = makeRegistry();
    registry.register({ id: 'freegantt.a', label: 'Core A', run: () => {} });
    registry.register({ id: 'freegantt.a', label: 'Plugin A', run: () => {} });
    registry.register({ id: 'freegantt.b', label: 'Core B', run: () => {} });

    expect(registry.available({} as never).map((command) => command.label)).toEqual(['Plugin A', 'Core B']);
  });
});
