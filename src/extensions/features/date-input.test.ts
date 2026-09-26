import { describe, expect, it } from 'vitest';
import { createDefaultDateInput } from './date-input.js';
import { Dataset } from '../../api/dataset.js';
import { instant } from '../../api/index.js';

// `dataset.time` is a real `ZonedTime`, and satisfies `date-input.ts`'s own narrower
// `ZoneDateMath` structurally. It is the same real zone math a live plugin would pass. This test
// file holds no hand-rolled Date/epoch arithmetic (I10 applies to `src/**`, tests included).
function zoneMath(timeZone: string): Dataset['time'] {
  return new Dataset({ entries: [], timeZone }).time;
}

describe('createDefaultDateInput (S5.8, D-S5-20)', () => {
  it('write() sets the <input type="date"> value from a zoned instant', () => {
    const control = createDefaultDateInput(zoneMath('UTC'));
    control.write(instant('2026-09-08T00:00:00Z'));
    expect((control.element as HTMLInputElement).value).toBe('2026-09-08');
  });

  it('read() round-trips a date-only value through the zone', () => {
    const control = createDefaultDateInput(zoneMath('UTC'));
    (control.element as HTMLInputElement).value = '2026-09-08';
    expect(control.read()).toBe(instant('2026-09-08T00:00:00Z'));
  });

  it('read() returns undefined for an empty value', () => {
    const control = createDefaultDateInput(zoneMath('UTC'));
    expect(control.read()).toBeUndefined();
  });

  it('a non-UTC zone reads/writes its own local midnight, not UTC midnight', () => {
    const control = createDefaultDateInput(zoneMath('America/New_York'));
    control.write(instant('2026-09-08T04:00:00Z')); // local midnight in New York (EDT, UTC-4)
    expect((control.element as HTMLInputElement).value).toBe('2026-09-08');
    (control.element as HTMLInputElement).value = '2026-09-09';
    expect(control.read()).toBe(instant('2026-09-09T04:00:00Z'));
  });

  it('onCommit fires on Enter and on a native change event', () => {
    const control = createDefaultDateInput(zoneMath('UTC'));
    let fired = 0;
    control.onCommit(() => fired++);
    control.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    control.element.dispatchEvent(new Event('change'));
    expect(fired).toBe(2);
  });

  it('the disposer returned by onCommit detaches both listeners', () => {
    const control = createDefaultDateInput(zoneMath('UTC'));
    let fired = 0;
    const dispose = control.onCommit(() => fired++);
    dispose();
    control.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    control.element.dispatchEvent(new Event('change'));
    expect(fired).toBe(0);
  });

  it('destroy() removes the element', () => {
    const control = createDefaultDateInput(zoneMath('UTC'));
    document.body.append(control.element);
    control.destroy();
    expect(control.element.isConnected).toBe(false);
  });
});
