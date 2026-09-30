// One theme for the whole page, not only for the Gantt. The page pins `data-fg-theme` on `<html>`
// (ADR 0029, recipe 2), and every Gantt on the page stays on `theme: 'auto'`, which reads that pin.
// The page chrome reads the same `--fg-*` tokens (`harness-chrome.css`), so the chart and the page
// around it can never disagree about which theme is on.
//
// Paper is the third theme. The library ships Light and Dark only; Paper is a consumer class over
// `--fg-*` alone, on top of a Light pin. No library edit made it, and no library edit can stop it.

export type PageTheme = 'auto' | 'light' | 'dark' | 'paper';

const PAGE_THEMES: readonly { readonly value: PageTheme; readonly label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'paper', label: 'Paper' },
];

const PAGE_THEME_STORAGE_KEY = 'freegantt-harness-theme';
const PAPER_CLASS = 'theme-paper';

function isPageTheme(value: string | null): value is PageTheme {
  return PAGE_THEMES.some((theme) => theme.value === value);
}

/** The theme the reader picked last, on any demo page. `'auto'` when nobody has picked yet. */
export function readStoredPageTheme(): PageTheme {
  try {
    const stored = localStorage.getItem(PAGE_THEME_STORAGE_KEY);
    return isPageTheme(stored) ? stored : 'auto';
  } catch {
    // A browser with site data blocked still gets a working page, on the default theme.
    return 'auto';
  }
}

/** The theme a link asks for: `planner.html?theme=paper`. `null` when the link names none. It beats
 *  the stored choice, so a shared link opens in the theme its sender meant. */
function readRequestedPageTheme(): PageTheme | null {
  const requested = new URLSearchParams(window.location.search).get('theme');
  return isPageTheme(requested) ? requested : null;
}

function storePageTheme(theme: PageTheme): void {
  try {
    localStorage.setItem(PAGE_THEME_STORAGE_KEY, theme);
  } catch {
    // Persisting the choice is a convenience; failing to persist it is not worth an error.
  }
}

/** Paints the whole page in `theme`. `'auto'` removes the pin, so the library's own
 *  `prefers-color-scheme` rule answers for the page and the Gantt together. */
export function applyPageTheme(theme: PageTheme): void {
  const root = document.documentElement;
  if (theme === 'auto') root.removeAttribute('data-fg-theme');
  else root.setAttribute('data-fg-theme', theme === 'dark' ? 'dark' : 'light');
  root.classList.toggle(PAPER_CLASS, theme === 'paper');
  storePageTheme(theme);
}

/** Mounts the Auto / Light / Dark / Paper control into `container`. */
export function mountThemePicker(container: HTMLElement): void {
  container.classList.add('segmented');
  container.setAttribute('role', 'group');
  container.setAttribute('aria-label', 'Theme');

  const buttons = PAGE_THEMES.map(({ value, label }) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', () => pick(value));
    container.append(button);
    return { value, button };
  });

  function pick(theme: PageTheme): void {
    applyPageTheme(theme);
    for (const { value, button } of buttons) button.setAttribute('aria-pressed', String(value === theme));
  }

  pick(readRequestedPageTheme() ?? readStoredPageTheme());
}
