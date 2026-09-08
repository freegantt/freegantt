import { describe, expect, it } from 'vitest';
import { createRegistrationTable } from './registration-table.js';

describe('createRegistrationTable', () => {
  it('returns the newest registration for a key, and undefined for an unknown key', () => {
    const table = createRegistrationTable<string, number>();
    expect(table.get('a')).toBeUndefined();
    table.register('a', 1);
    table.register('a', 2);
    expect(table.get('a')).toBe(2);
    expect(table.get('b')).toBeUndefined();
  });

  it('falls back to the previous registration when the newest is disposed', () => {
    const table = createRegistrationTable<string, number>();
    table.register('a', 1);
    const disposeSecond = table.register('a', 2);
    disposeSecond();
    expect(table.get('a')).toBe(1);
  });

  it('leaves the newest registration in place when an older one is disposed out of order', () => {
    const table = createRegistrationTable<string, number>();
    const disposeFirst = table.register('a', 1);
    table.register('a', 2);
    disposeFirst();
    expect(table.get('a')).toBe(2);
    expect(table.active()).toEqual([2]);
  });

  it('removes the key once every registration on it is disposed', () => {
    const table = createRegistrationTable<string, number>();
    const disposeFirst = table.register('a', 1);
    const disposeSecond = table.register('a', 2);
    table.register('b', 10);
    disposeSecond();
    disposeFirst();
    expect(table.get('a')).toBeUndefined();
    expect(table.active()).toEqual([10]);
  });

  it('falls back to an initial pair once every later registration on that key is disposed', () => {
    const table = createRegistrationTable<string, number>([['a', 0]]);
    const disposeLater = table.register('a', 1);
    disposeLater();
    expect(table.get('a')).toBe(0);
  });

  it('returns active() in first-registration order, one value per key', () => {
    const table = createRegistrationTable<string, number>();
    table.register('a', 1);
    table.register('b', 2);
    table.register('a', 3); // a's key slot came first, but its winner is now 3
    expect(table.active()).toEqual([3, 2]);
  });

  it('gives two independent disposers when the same value is registered twice', () => {
    const table = createRegistrationTable<string, string>();
    const sharedValue = 'same-value';
    const disposeFirst = table.register('a', sharedValue);
    const disposeSecond = table.register('a', sharedValue);
    disposeSecond();
    expect(table.get('a')).toBe(sharedValue);
    disposeFirst();
    expect(table.get('a')).toBeUndefined();
  });

  it('keys() lists every key that still holds a registration, in first-registration order', () => {
    const table = createRegistrationTable<string, number>();
    table.register('a', 1);
    const disposeB = table.register('b', 2);
    table.register('a', 3);
    expect(table.keys()).toEqual(['a', 'b']);

    disposeB();
    expect(table.keys()).toEqual(['a']);
  });

  it('does nothing the second time a disposer is called', () => {
    const table = createRegistrationTable<string, number>();
    table.register('a', 1);
    const disposeSecond = table.register('a', 2);
    disposeSecond();
    disposeSecond();
    expect(table.get('a')).toBe(1);
  });
});
