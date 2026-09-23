import { describe, expect, it } from 'vitest';
import { resolveConvenienceChords } from './convenience-chords.js';
import type { ConvenienceChords } from './convenience-chords.js';

describe('resolveConvenienceChords (#262)', () => {
  it('defaults every convenience command on', () => {
    expect(resolveConvenienceChords(undefined)).toEqual({
      'freegantt.undo': true,
      'freegantt.redo': true,
      'freegantt.selectAll': true,
      'freegantt.deleteSelection': true,
      'freegantt.zoomIn': true,
      'freegantt.zoomOut': true,
      'freegantt.panToToday': true,
      'freegantt.panRight': true,
      'freegantt.panLeft': true,
      'freegantt.panToStart': true,
      'freegantt.panToEnd': true,
    });
    expect(resolveConvenienceChords({})).toEqual(resolveConvenienceChords(undefined));
  });

  it('false turns every convenience command off', () => {
    const resolved = resolveConvenienceChords(false);
    expect(Object.values(resolved).every((enabled) => enabled === false)).toBe(true);
  });

  it('a per-command map pins one command; a missing one stays on', () => {
    const resolved = resolveConvenienceChords({ 'freegantt.undo': false });
    expect(resolved['freegantt.undo']).toBe(false);
    expect(resolved['freegantt.redo']).toBe(true);
    expect(resolved['freegantt.selectAll']).toBe(true);
  });

  it('does not typecheck for an obligation command id, so an app author cannot silence one', () => {
    const attempt = (): ConvenienceChords => ({
      // @ts-expect-error #262: `clearSelection` is an obligation chord — [S5-A4]/WCAG 2.1.1 keep it
      // bound, so `ConvenienceCommandId` does not name it and this map key fails to compile.
      'freegantt.clearSelection': false,
    });
    expect(attempt).toBeTypeOf('function');
  });
});
