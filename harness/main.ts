import { Gantt, Dataset } from '../src/api/index.js';
import type { Theme } from '../src/api/index.js';
import { sampleEntryInputs } from '../fixtures/sample-project.js';

const dataset = new Dataset({ entries: sampleEntryInputs, timeZone: 'UTC' });

const gantt = new Gantt({ host: '#gantt', dataset });

const THEME_STORAGE_KEY = 'freegantt-harness-theme';

function isTheme(value: string | null): value is Theme {
  return value === 'auto' || value === 'light' || value === 'dark';
}

function applyTheme(choice: Theme): void {
  gantt.theme = choice;
  if (choice === 'auto') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', choice);
  }
  localStorage.setItem(THEME_STORAGE_KEY, choice);
  document.querySelectorAll<HTMLButtonElement>('[data-theme-choice]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.themeChoice === choice));
  });
}

const stored = localStorage.getItem(THEME_STORAGE_KEY);
applyTheme(isTheme(stored) ? stored : 'auto');

document.querySelectorAll<HTMLButtonElement>('[data-theme-choice]').forEach((button) => {
  button.addEventListener('click', () => {
    const choice = button.dataset.themeChoice;
    if (isTheme(choice)) applyTheme(choice);
  });
});
