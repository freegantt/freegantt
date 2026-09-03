import { describe, expect, it } from 'vitest';
import { Keymap, normalizeChord, isEditableTarget } from './keymap.js';
import type { KeyEventLike } from './keymap.js';
import { CommandRegistry } from './commands.js';
import type { CommandContext } from './commands.js';

function event(overrides: Partial<KeyEventLike> = {}): KeyEventLike {
  return {
    key: 'a',
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    metaKey: false,
    isComposing: false,
    target: null,
    ...overrides,
  };
}

function makeCommands(): { registry: CommandRegistry<unknown>; ctx: CommandContext<unknown>; ran: string[] } {
  const ran: string[] = [];
  const ctx = {} as CommandContext<unknown>;
  const registry = new CommandRegistry<unknown>(() => ctx);
  registry.register({ id: 'freegantt.a', label: 'A', run: () => ran.push('a') });
  registry.register({ id: 'freegantt.b', label: 'B', run: () => ran.push('b') });
  return { registry, ctx, ran };
}

describe('normalizeChord (D-S5-7)', () => {
  it('resolves Mod to Ctrl off Apple and Meta on Apple', () => {
    expect(normalizeChord('Mod+Z', false)).toMatchObject({ key: 'z', ctrl: true, meta: false });
    expect(normalizeChord('Mod+Z', true)).toMatchObject({ key: 'z', ctrl: false, meta: true });
  });

  it('parses plain and multi-modifier chords', () => {
    expect(normalizeChord('ArrowRight', false)).toMatchObject({
      key: 'arrowright',
      ctrl: false,
      shift: false,
      alt: false,
      meta: false,
    });
    expect(normalizeChord('Shift+F10', false)).toMatchObject({ key: 'f10', shift: true });
    expect(normalizeChord('Alt+ArrowLeft', false)).toMatchObject({ key: 'arrowleft', alt: true });
  });
});

describe('isEditableTarget (issue #137 F7)', () => {
  it('is true for an input, a textarea, contenteditable, and mid-composition', () => {
    const input = document.createElement('input');
    const textarea = document.createElement('textarea');
    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    document.body.append(editable);
    const plain = document.createElement('div');

    expect(isEditableTarget(event({ target: input }))).toBe(true);
    expect(isEditableTarget(event({ target: textarea }))).toBe(true);
    expect(isEditableTarget(event({ target: editable }))).toBe(true);
    expect(isEditableTarget(event({ target: plain }))).toBe(false);
    expect(isEditableTarget(event({ target: plain, isComposing: true }))).toBe(true);
  });
});

describe('Keymap.resolve (D-S5-7)', () => {
  it('runs the newest matching binding first', () => {
    const { registry, ctx, ran } = makeCommands();
    const keymap = new Keymap<unknown>(registry, () => ctx);
    keymap.register({ chord: 'Mod+K', command: 'freegantt.a' });
    keymap.register({ chord: 'Mod+K', command: 'freegantt.b' });

    const handled = keymap.resolve(event({ key: 'k', ctrlKey: true }));

    expect(handled).toBe(true);
    expect(ran).toEqual(['b']);
  });

  it('a declining when falls through to an older binding', () => {
    const { registry, ctx, ran } = makeCommands();
    const keymap = new Keymap<unknown>(registry, () => ctx);
    keymap.register({ chord: 'Mod+K', command: 'freegantt.a' });
    keymap.register({ chord: 'Mod+K', command: 'freegantt.b', when: () => false });

    const handled = keymap.resolve(event({ key: 'k', ctrlKey: true }));

    expect(handled).toBe(true);
    expect(ran).toEqual(['a']);
  });

  it('an unmatched chord leaves the event untouched', () => {
    const { registry, ctx, ran } = makeCommands();
    const keymap = new Keymap<unknown>(registry, () => ctx);
    keymap.register({ chord: 'Mod+K', command: 'freegantt.a' });

    const handled = keymap.resolve(event({ key: 'z' }));

    expect(handled).toBe(false);
    expect(ran).toEqual([]);
  });

  it('a chord typed in an editable target is ignored unless captureInEditable is set', () => {
    const { registry, ctx, ran } = makeCommands();
    const keymap = new Keymap<unknown>(registry, () => ctx);
    keymap.register({ chord: 'Mod+K', command: 'freegantt.a' });
    keymap.register({ chord: 'Mod+K', command: 'freegantt.b', captureInEditable: true });
    const input = document.createElement('input');

    const handled = keymap.resolve(event({ key: 'k', ctrlKey: true, target: input }));

    expect(handled).toBe(true);
    expect(ran).toEqual(['b']);
  });

  it('register() returns a disposer that removes the binding', () => {
    const { registry, ctx, ran } = makeCommands();
    const keymap = new Keymap<unknown>(registry, () => ctx);
    const remove = keymap.register({ chord: 'Mod+K', command: 'freegantt.a' });
    remove();

    const handled = keymap.resolve(event({ key: 'k', ctrlKey: true }));

    expect(handled).toBe(false);
    expect(ran).toEqual([]);
  });
});
