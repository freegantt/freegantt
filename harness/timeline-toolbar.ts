// Shared toolbar wiring for the S1.12 navigation surface (plans/s1.12-timeline-navigation/README.md
// §3.7): zoom in/out, a preset picker and a "Today" button, over the plain `Gantt` API. Shared across
// `index.html`, `zoom.html` and `data.html` (§3.7's own toolbar is `zoom.html`-only, but the request
// this answers is "make the surface visible on every demo page", so this file exists to avoid three
// copies of the same dozen lines) — every control is a plain assignment or a one-line call, same as
// the spec's toolbar; a control that had to compute something would be a library gap, not a harness
// convenience.

import type { Gantt, PresetRef, ShippedPresetId } from '../src/api/index.js';

export interface TimelineToolbarOptions {
  gantt: Gantt;
  container: HTMLElement;
  /** Include a `fit` select (`pane` / `preset`). Default `false` — most pages don't demo the density
   *  floor (D-S1.12-2), so `pane` is fine left at its default. */
  showFit?: boolean;
  /** Include a `locale` select. Default `false`. */
  showLocale?: boolean;
  /** Include the `todayLine` toggle checkbox. Default `false`. */
  showTodayLineToggle?: boolean;
}

const PRESET_OPTIONS: readonly ShippedPresetId[] = [
  'hour',
  'hourDayWeek',
  'day',
  'dayAndWeek',
  'dayWeekMonth',
  'weekAndMonth',
  'weekMonthYear',
  'monthAndYear',
  'year',
];

const LOCALE_OPTIONS = ['en-US', 'de-DE', 'ja-JP'] as const;

/** Builds the toolbar DOM and wires it straight to the plain `Gantt` surface — `zoomIn`/`zoomOut`,
 *  `preset`, `panToToday`, and (when enabled) `fit`/`locale`/`todayLine`. Every button's disabled
 *  state and the preset select's value stay in sync with `gantt.on('change')`. */
export function mountTimelineToolbar(options: TimelineToolbarOptions): void {
  const { gantt, container, showFit = false, showLocale = false, showTodayLineToggle = false } = options;

  const bar = document.createElement('div');
  bar.className = 'fg-toolbar';

  const zoomOutBtn = document.createElement('button');
  zoomOutBtn.type = 'button';
  zoomOutBtn.textContent = '−';
  zoomOutBtn.setAttribute('aria-label', 'Zoom out');

  const zoomInBtn = document.createElement('button');
  zoomInBtn.type = 'button';
  zoomInBtn.textContent = '+';
  zoomInBtn.setAttribute('aria-label', 'Zoom in');

  const presetLabel = document.createElement('label');
  presetLabel.textContent = 'Preset ';
  const presetSelect = document.createElement('select');
  for (const id of PRESET_OPTIONS) {
    const option = document.createElement('option');
    option.value = id;
    option.textContent = id;
    presetSelect.append(option);
  }
  presetLabel.append(presetSelect);

  const todayBtn = document.createElement('button');
  todayBtn.type = 'button';
  todayBtn.textContent = 'Today';

  bar.append(zoomOutBtn, zoomInBtn, presetLabel, todayBtn);

  let fitSelect: HTMLSelectElement | undefined;
  if (showFit) {
    const fitLabel = document.createElement('label');
    fitLabel.textContent = 'Fit ';
    fitSelect = document.createElement('select');
    for (const id of ['pane', 'preset'] as const) {
      const option = document.createElement('option');
      option.value = id;
      option.textContent = id;
      fitSelect.append(option);
    }
    fitLabel.append(fitSelect);
    bar.append(fitLabel);
  }

  let localeSelect: HTMLSelectElement | undefined;
  if (showLocale) {
    const localeLabel = document.createElement('label');
    localeLabel.textContent = 'Locale ';
    localeSelect = document.createElement('select');
    for (const locale of LOCALE_OPTIONS) {
      const option = document.createElement('option');
      option.value = locale;
      option.textContent = locale;
      localeSelect.append(option);
    }
    localeLabel.append(localeSelect);
    bar.append(localeLabel);
  }

  let todayLineCheckbox: HTMLInputElement | undefined;
  if (showTodayLineToggle) {
    const todayLineLabel = document.createElement('label');
    todayLineCheckbox = document.createElement('input');
    todayLineCheckbox.type = 'checkbox';
    todayLineCheckbox.checked = gantt.todayLine;
    todayLineLabel.append(todayLineCheckbox, ' Today line');
    bar.append(todayLineLabel);
  }

  container.append(bar);

  function refresh(): void {
    zoomOutBtn.disabled = !gantt.canZoomOut;
    zoomInBtn.disabled = !gantt.canZoomIn;
    presetSelect.value = gantt.preset.id;
    if (fitSelect && typeof gantt.fit === 'string') fitSelect.value = gantt.fit;
  }

  // `Gantt` has no `change` event for `preset`/`fit`/`zoomPresets` (`plans/02` §3 ships exactly two
  // events, both grid-width — I11); each control refreshes the toolbar itself right after its own
  // plain assignment or call, the same read-after-write a caller would do.
  zoomOutBtn.addEventListener('click', () => {
    gantt.zoomOut();
    refresh();
  });
  zoomInBtn.addEventListener('click', () => {
    gantt.zoomIn();
    refresh();
  });
  presetSelect.addEventListener('change', () => {
    gantt.preset = presetSelect.value as PresetRef;
    refresh();
  });
  todayBtn.addEventListener('click', () => gantt.panToToday());
  fitSelect?.addEventListener('change', () => {
    gantt.fit = fitSelect!.value as 'pane' | 'preset';
    refresh();
  });
  localeSelect?.addEventListener('change', () => {
    gantt.locale = localeSelect!.value;
  });
  todayLineCheckbox?.addEventListener('change', () => {
    gantt.todayLine = todayLineCheckbox!.checked;
  });

  refresh();
}
