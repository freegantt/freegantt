// Shared toolbar wiring for the S1.12 navigation surface (plans/s1.12-timeline-navigation/README.md
// §3.7): zoom in/out, a preset picker and a "Today" button, over the plain `Gantt` API. Shared across
// `index.html`, `zoom.html` and `data.html` (§3.7's own toolbar is `zoom.html`-only, but the request
// this answers is "make the surface visible on every demo page", so this file exists to avoid three
// copies of the same dozen lines). Zoom buttons stay in sync through `gantt.on('navigationChange')`.

import type { Gantt } from 'freegantt';

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

const LOCALE_OPTIONS = ['en-US', 'de-DE', 'ja-JP'] as const;

/** Builds the toolbar DOM and wires it to the `Gantt` surface. `navigationChange` keeps the
 *  zoom buttons and preset picker in sync when something else writes Preset or Fit. */
export function mountTimelineToolbar(options: TimelineToolbarOptions): void {
  const { gantt, container, showFit = false, showLocale = false, showTodayLineToggle = false } = options;

  const bar = document.createElement('div');
  bar.className = 'demo-toolbar';

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
  for (const preset of gantt.zoomPresets) {
    const option = document.createElement('option');
    option.value = preset.id;
    option.textContent = preset.id;
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
    todayLineCheckbox.checked = gantt.todayLine !== false;
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

  zoomOutBtn.addEventListener('click', () => {
    gantt.zoomOut();
  });
  zoomInBtn.addEventListener('click', () => {
    gantt.zoomIn();
  });
  presetSelect.addEventListener('change', () => {
    gantt.preset = presetSelect.value;
  });
  // S5.2, D-S5-6: the toolbar's own button is the command, not a second call to `panToToday()` —
  // the same call `gantt.commands.run(id)` a keybinding or a menu item (S5.5) makes.
  todayBtn.addEventListener('click', () => gantt.commands.run('freegantt.panToToday'));
  fitSelect?.addEventListener('change', () => {
    gantt.fit = fitSelect!.value as 'pane' | 'preset';
  });
  localeSelect?.addEventListener('change', () => {
    gantt.locale = localeSelect!.value;
  });
  todayLineCheckbox?.addEventListener('change', () => {
    gantt.todayLine = todayLineCheckbox!.checked;
  });

  gantt.on('navigationChange', refresh);
  refresh();
}
