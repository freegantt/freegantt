import { describe, expect, it } from 'vitest';
import { GanttShell } from './gantt-shell.js';
import { ScrollModel, TimeScaleModel } from '../layout/index.js';
import { entryId } from '../model/index.js';
import type { Entry, Instant } from '../model/index.js';

// view/ has no import edge to time/ (plans/01 §1) — instant() lives there. Date.parse on a
// Z-offset string is deterministic regardless of the host machine's zone, unlike `new Date(str)`
// on a zoneless string (#27), so this is not the thing I10 exists to ban.
function instant(iso: string): Instant {
  return Date.parse(iso) as Instant;
}

const timeZone = 'UTC';
const rangeStart = instant('2026-09-01T00:00:00Z');
const rangeEnd = instant('2026-09-06T00:00:00Z'); // 5 days

const entries: Entry[] = [
  {
    id: entryId('t1'),
    name: 'Entry 1',
    start: rangeStart,
    end: instant('2026-09-03T00:00:00Z'),
  },
];

describe('GanttShell header band', () => {
  it('renders one tick per day for the day preset', () => {
    const host = document.createElement('div');
    const scale = new TimeScaleModel({ range: { start: rangeStart, end: rangeEnd } });
    const shell = new GanttShell({ host, dataset: { entries, timeZone }, scale });

    const ticks = host.querySelectorAll('.fg-header .fg-tick');
    expect(ticks).toHaveLength(5);
    expect(ticks[0]?.textContent).toBe('2026-09-01');

    shell.destroy();
    expect(host.children.length).toBe(0);
  });

  it('re-renders when a second Gantt binds to the same shared scale (#6, D9)', () => {
    // No pinned range: the scale fits every bound dataset, so binding B widens the span A reads from.
    const scale = new TimeScaleModel();
    const hostA = document.createElement('div');
    const shellA = new GanttShell({ host: hostA, dataset: { entries, timeZone }, scale });

    const initialTickCount = hostA.querySelectorAll('.fg-header .fg-tick').length;

    const hostB = document.createElement('div');
    const widerEntries: Entry[] = [
      {
        id: entryId('w1'),
        name: 'W1',
        start: rangeStart,
        end: instant('2026-09-20T00:00:00Z'),
      },
    ];
    const shellB = new GanttShell({ host: hostB, dataset: { entries: widerEntries, timeZone }, scale });

    // A never called render() itself after B bound — the notify from B's bind is what pushed this.
    expect(hostA.querySelectorAll('.fg-header .fg-tick').length).toBeGreaterThan(initialTickCount);

    shellA.destroy();
    shellB.destroy();
  });
});

describe('row height (#39)', () => {
  it('reads --fg-row-height from the host, not a constructor option', () => {
    const host = document.createElement('div');
    document.body.append(host);
    host.style.setProperty('--fg-row-height', '48px');

    const shell = new GanttShell({ host, dataset: { entries, timeZone } });
    const bar = host.querySelector<HTMLElement>('.fg-bar')!;
    expect(bar.style.height).toBe('48px');

    shell.destroy();
    host.remove();
  });

  it('falls back to a default when --fg-row-height is unset', () => {
    const host = document.createElement('div');
    const shell = new GanttShell({ host, dataset: { entries, timeZone } });
    const bar = host.querySelector<HTMLElement>('.fg-bar')!;
    expect(bar.style.height).toBe('32px');
    shell.destroy();
  });
});

describe('GanttShell.destroy()', () => {
  it('is idempotent — a second call does not throw or double-unbind (#34)', () => {
    const host = document.createElement('div');
    const shell = new GanttShell({ host, dataset: { entries, timeZone } });

    expect(() => {
      shell.destroy();
      shell.destroy();
    }).not.toThrow();
  });
});

describe('scroll (D9, #9)', () => {
  function tallEntries(count: number): Entry[] {
    return Array.from({ length: count }, (_, i) => ({
      id: entryId(`e${i}`),
      name: `Entry ${i}`,
      start: rangeStart,
      end: instant('2026-09-03T00:00:00Z'),
    }));
  }

  it('constructs a private default ScrollModel when scroll is omitted', () => {
    const host = document.createElement('div');
    const shell = new GanttShell({ host, dataset: { entries, timeZone } });
    // No shared model was passed; the shell still renders and destroys cleanly, proving a
    // default was constructed rather than left unset.
    expect(host.querySelectorAll('.fg-bar').length).toBeGreaterThan(0);
    shell.destroy();
  });

  // Whether a model-driven position write actually lands on the element (I12's own concern) is
  // covered by scroll-attachment.test.ts and, for the real-clamp case happy-dom cannot express,
  // e2e/scroll-sync.spec.ts (S1.5 README §7) — this level proves GanttShell pushes the *right
  // extents* into the shared model in the first place.

  it('two shells sharing one ScrollModel both contribute to the shared max (U1/U2)', () => {
    const scroll = new ScrollModel();
    const hostA = document.createElement('div');
    Object.defineProperty(hostA, 'clientHeight', { value: 100, configurable: true });
    const hostB = document.createElement('div');
    Object.defineProperty(hostB, 'clientHeight', { value: 100, configurable: true });

    const shellA = new GanttShell({ host: hostA, dataset: { entries: tallEntries(50), timeZone }, scroll });
    const shellB = new GanttShell({ host: hostB, dataset: { entries: tallEntries(50), timeZone }, scroll });

    // 50 rows * 32px default row height = 1600, in a 100px pane -> max.y 1500 for either chart.
    expect(scroll.state.max.y).toBe(1500);

    shellA.destroy();
    shellB.destroy();
  });

  it('culls rows against the current scroll position, not always (0,0) (regression: render() hardcoded viewport.y to 0, so scrolling past the first screenful rendered nothing)', () => {
    const scroll = new ScrollModel();
    const host = document.createElement('div');
    Object.defineProperty(host, 'clientHeight', { value: 320, configurable: true }); // 10 rows @ 32px

    const shell = new GanttShell({ host, dataset: { entries: tallEntries(50), timeZone }, scroll });

    const labelsAt = (): string[] =>
      Array.from(host.querySelectorAll('.fg-row'), (row) => row.textContent ?? '');

    expect(labelsAt()).toContain('Entry 0');
    expect(labelsAt()).not.toContain('Entry 40');

    scroll.panTo({ y: 40 * 32 }); // scroll 40 rows down

    expect(labelsAt()).not.toContain('Entry 0');
    expect(labelsAt()).toContain('Entry 40');

    shell.destroy();
  });

  it("a shorter chart's own max is the loosest bound it needs, not the taller chart's (U3)", () => {
    const scroll = new ScrollModel();
    const shortHost = document.createElement('div');
    Object.defineProperty(shortHost, 'clientHeight', { value: 100, configurable: true });
    const tallHost = document.createElement('div');
    Object.defineProperty(tallHost, 'clientHeight', { value: 100, configurable: true });

    const shortShell = new GanttShell({
      host: shortHost,
      dataset: { entries: tallEntries(5), timeZone },
      scroll,
    });
    const tallShell = new GanttShell({
      host: tallHost,
      dataset: { entries: tallEntries(500), timeZone },
      scroll,
    });

    // Loosest bound across both bindings: the tall chart's 500*32-100=15900 dwarfs the short
    // chart's 5*32-100=60 (D-S1.5-1) — proving both extents actually reached the shared model.
    expect(scroll.state.max.y).toBe(500 * 32 - 100);

    shortShell.destroy();
    tallShell.destroy();
  });
});

describe('GanttShell host resolution (#38)', () => {
  it('resolves a string host as a CSS selector', () => {
    const host = document.createElement('div');
    host.id = 'target';
    document.body.append(host);

    const shell = new GanttShell({ host: '#target', dataset: { entries, timeZone } });
    expect(host.querySelectorAll('.fg-bar').length).toBeGreaterThan(0);

    shell.destroy();
    host.remove();
  });

  it('throws naming the selector when nothing matches', () => {
    expect(() => new GanttShell({ host: '#does-not-exist', dataset: { entries, timeZone } })).toThrow(
      /does-not-exist/,
    );
  });
});
