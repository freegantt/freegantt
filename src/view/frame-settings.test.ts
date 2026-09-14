// #167: the invalidation matrix, checked in Node with no DOM at all. This file runs in the `pure`
// vitest project (`vitest.workspace.ts`), whose setup throws the moment a DOM global appears. So the
// module's DOM-free claim is proved here, not asserted in a comment.
//
// Before this file the same knowledge lived in twelve `GanttShell` setters, and the only way to ask
// "what does `rowSource` invalidate?" was to mount a real Gantt and watch what it painted.

import { describe, expect, it } from 'vitest';
import { FrameSettings, DEFAULT_ROW_HEIGHT, DEFAULT_TODAY_LINE_MARGIN_TICKS } from './frame-settings.js';
import type { FrameSettingsPatch, FrameSettingsPorts, PerFrameLayoutInput } from './frame-settings.js';
import type { PixelPropertyPolicy } from '../render/dom/pixel-property.js';
import {
  DEFAULT_BAR_HEIGHT_PX,
  DEFAULT_MIN_BAR_WIDTH_PX,
  DEFAULT_TICK_BOX_FLOOR_PX,
  createVariantRegistry,
} from '../layout/index.js';
import type { DateLine, RowSource, TimeScale, ViewPreset } from '../layout/index.js';
import type { Instant } from '../model/index.js';

/** `view/` may not import `time/` (`view-boundary`), and a date line only needs a stamp to compare.
 *  Every other `view/` test builds one the same way. */
function instant(iso: string): Instant {
  return Date.parse(iso) as Instant;
}

/** Records the ports in call order, so a test asserts the whole answer and not one half of it. */
function recordingPorts(pixels: Record<string, number> = {}): {
  ports: FrameSettingsPorts;
  calls: string[];
  reads: string[];
} {
  const calls: string[] = [];
  const reads: string[] = [];
  const ports: FrameSettingsPorts = {
    requestFrame: () => calls.push('requestFrame'),
    rebindFields: () => calls.push('rebindFields'),
    invalidateItems: () => calls.push('invalidateItems'),
    readPixelProperty: (property: string, policy: PixelPropertyPolicy) => {
      reads.push(property);
      return pixels[property] ?? policy.fallback;
    },
  };
  return { ports, calls, reads };
}

function settingsWith(initial: FrameSettingsPatch = {}): {
  settings: FrameSettings;
  calls: string[];
} {
  const { ports, calls } = recordingPorts();
  return { settings: new FrameSettings(ports, initial), calls };
}

/** The minimum a frame contributes. None of it is a setting, which is the split under test. */
function perFrame(): PerFrameLayoutInput {
  const scale = { timeZone: 'UTC' } as unknown as TimeScale;
  return {
    entries: [],
    scale,
    preset: { id: 'day' } as unknown as ViewPreset,
    visible: { x: 0, y: 0, width: 100, height: 100 },
    revision: 7,
    datasetRevision: 0,
    columns: [],
    variants: createVariantRegistry({ fieldFor: () => undefined }),
  };
}

describe('FrameSettings — the invalidation table', () => {
  // One case per row of the table. A changed setting invalidates exactly this much, and the shell's
  // setter adds nothing of its own.
  const cases: { setting: string; patch: FrameSettingsPatch; expected: string[] }[] = [
    { setting: 'locale', patch: { locale: 'de-DE' }, expected: ['rebindFields', 'requestFrame'] },
    {
      setting: 'rowSource',
      patch: { rowSource: { source: 'entries', tree: true } },
      expected: ['invalidateItems', 'requestFrame'],
    },
    { setting: 'todayLine', patch: { todayLine: false }, expected: ['requestFrame'] },
    { setting: 'dateLines', patch: { dateLines: [] }, expected: ['requestFrame'] },
    {
      setting: 'dateLineLabelPlacement',
      patch: { dateLineLabelPlacement: 'overlayOnTimeLine' },
      expected: ['requestFrame'],
    },
    { setting: 'barLabels', patch: { barLabels: 'outside' }, expected: ['requestFrame'] },
    { setting: 'barRenderer', patch: { barRenderer: () => undefined }, expected: ['requestFrame'] },
    { setting: 'cellRenderer', patch: { cellRenderer: () => undefined }, expected: ['requestFrame'] },
    { setting: 'headerRenderer', patch: { headerRenderer: () => undefined }, expected: ['requestFrame'] },
    { setting: 'tooltipRenderer', patch: { tooltipRenderer: () => undefined }, expected: ['requestFrame'] },
    { setting: 'todayLineMarginTicks', patch: { todayLineMarginTicks: 5 }, expected: [] },
    { setting: 'fieldCompares', patch: { fieldCompares: [] }, expected: [] },
  ];

  for (const { setting, patch, expected } of cases) {
    it(`${setting} invalidates ${expected.length === 0 ? 'nothing' : expected.join(' then ')}`, () => {
      const { settings, calls } = settingsWith();
      settings.set(patch);
      expect(calls).toEqual(expected);
    });
  }

  it('a value identical to the one already held invalidates nothing', () => {
    const rowSource: RowSource = { source: 'entries', tree: true };
    const { settings, calls } = settingsWith({ rowSource, locale: 'de-DE' });
    settings.set({ rowSource, locale: 'de-DE' });
    expect(calls).toEqual([]);
  });

  // #187: the identity check above covers object-valued settings too, and that is a deliberate
  // contract, not a side effect. A consumer who mutates the object they already handed over and
  // assigns it again gets nothing. `plans/02` §2 states the rule and names the copy that asks for
  // the repaint. These two cases are what would fail if the check ever grew an object exemption.
  it('mutating a held object and assigning it back invalidates nothing (#187)', () => {
    const held: DateLine[] = [{ placeAt: instant('2024-01-01T00:00:00Z') }];
    const { settings, calls } = settingsWith({ dateLines: held });
    held.push({ placeAt: instant('2024-01-02T00:00:00Z') });
    settings.set({ dateLines: held });
    expect(calls).toEqual([]);
  });

  it('a copy of that object carries the same mutation and does invalidate (#187)', () => {
    const held: DateLine[] = [{ placeAt: instant('2024-01-01T00:00:00Z') }];
    const { settings, calls } = settingsWith({ dateLines: held });
    settings.set({ dateLines: [...held, { placeAt: instant('2024-01-02T00:00:00Z') }] });
    expect(calls).toEqual(['requestFrame']);
  });

  it('two settings in one patch ask for one repaint, not two', () => {
    const { settings, calls } = settingsWith();
    settings.set({ todayLine: false, dateLines: [] });
    expect(calls).toEqual(['requestFrame']);
  });

  it('a rebind and a repaint in one patch run the rebind first, then one repaint', () => {
    const { settings, calls } = settingsWith();
    settings.set({ locale: 'fr-FR', todayLine: false });
    expect(calls).toEqual(['rebindFields', 'requestFrame']);
  });

  it('the constructor writes its initial settings without invalidating anything', () => {
    const { settings, calls } = settingsWith({ locale: 'de-DE', rowSource: { source: 'entries' } });
    expect(calls).toEqual([]);
    expect(settings.locale).toBe('de-DE');
  });

  it('clearing a setting is a key present with undefined, and still invalidates', () => {
    const { settings, calls } = settingsWith({ locale: 'de-DE' });
    settings.set({ locale: undefined });
    expect(settings.locale).toBeUndefined();
    expect(calls).toEqual(['rebindFields', 'requestFrame']);
  });

  it('an empty patch invalidates nothing', () => {
    const { settings, calls } = settingsWith();
    settings.set({});
    expect(calls).toEqual([]);
  });
});

describe('FrameSettings — the pixel properties', () => {
  it('reads all four properties, and asks for no frame of its own', () => {
    const { ports, calls, reads } = recordingPorts({
      '--fg-row-height': 48,
      '--fg-tick-box-floor': 3,
      '--fg-bar-min-width': 16,
      '--fg-bar-height': 20,
    });
    const settings = new FrameSettings(ports);
    settings.refreshPixelProperties();

    expect(reads).toEqual([
      '--fg-row-height',
      '--fg-tick-box-floor',
      '--fg-bar-min-width',
      '--fg-bar-height',
    ]);
    expect(calls).toEqual([]);
    expect(settings.rowHeight).toBe(48);
    expect(settings.minBarWidthPx).toBe(16);
  });

  it('starts on the library defaults, before anything is measured', () => {
    const { ports } = recordingPorts();
    const settings = new FrameSettings(ports);
    expect(settings.rowHeight).toBe(DEFAULT_ROW_HEIGHT);
    expect(settings.minBarWidthPx).toBe(DEFAULT_MIN_BAR_WIDTH_PX);
    expect(settings.todayLineMarginTicks).toBe(DEFAULT_TODAY_LINE_MARGIN_TICKS);
    expect(settings.dateLineLabelPlacement).toBe('overlayOnGanttBody');
  });

  it('each property keeps its own policy — the fallback answers an unusable value', () => {
    const { ports } = recordingPorts();
    const settings = new FrameSettings(ports);
    settings.refreshPixelProperties();
    const input = settings.toLayoutInput(perFrame());
    expect(input.rowHeight).toBe(DEFAULT_ROW_HEIGHT);
    expect(input.tickBoxFloorPx).toBe(DEFAULT_TICK_BOX_FLOOR_PX);
    expect(input.minBarWidthPx).toBe(DEFAULT_MIN_BAR_WIDTH_PX);
    expect(input.barHeightPx).toBe(DEFAULT_BAR_HEIGHT_PX);
  });
});

describe('FrameSettings — toLayoutInput', () => {
  it('carries what the frame contributes through untouched', () => {
    const { ports } = recordingPorts();
    const settings = new FrameSettings(ports);
    const frame = perFrame();
    const input = settings.toLayoutInput(frame);
    expect(input.entries).toBe(frame.entries);
    expect(input.revision).toBe(7);
    expect(input.variants).toBe(frame.variants);
  });

  it('spells `rowSource` as `LayoutInput`’s own `rows`', () => {
    const rowSource: RowSource = { source: 'entries', tree: true };
    const { ports } = recordingPorts();
    const settings = new FrameSettings(ports, { rowSource });
    expect(settings.toLayoutInput(perFrame()).rows).toBe(rowSource);
  });

  it('omits an unset locale rather than passing undefined through', () => {
    const { ports } = recordingPorts();
    const settings = new FrameSettings(ports);
    expect('locale' in settings.toLayoutInput(perFrame())).toBe(false);
  });

  it('passes a set locale through', () => {
    const { ports } = recordingPorts();
    const settings = new FrameSettings(ports, { locale: 'de-DE' });
    expect(settings.toLayoutInput(perFrame()).locale).toBe('de-DE');
  });

  it('two instances share no settings (I2)', () => {
    const first = new FrameSettings(recordingPorts().ports);
    const second = new FrameSettings(recordingPorts().ports);
    first.set({ todayLine: false });
    expect(second.todayLine).toBe(true);
  });
});
