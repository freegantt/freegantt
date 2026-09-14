// view/ — theme resolution (S1.10 follow-up, #330). `Theme` itself ('auto' | 'light' | 'dark') is
// what a consumer states; `ResolvedTheme` is what actually painted, once 'auto' is settled one way
// or the other. DOM-touching (a `closest()` walk), so it lives in view/, not layout/ or model/.

/** What `Gantt.resolvedTheme` answers — never `'auto'`, because that is a question, not a state. */
export type ResolvedTheme = 'light' | 'dark';

/** The explicit pin nearest this container, walking up through the DOM — this Gantt's own
 *  `data-fg-theme` (written by its `theme` setter, `'light'`/`'dark'` only) if it carries one,
 *  else the nearest ancestor's (#271: a wrapping app's own pin reaches every Gantt inside it, the
 *  same colour tokens follow either way). `undefined` when nothing up the tree pins it — 'auto' the
 *  whole way, every ancestor included. */
function ancestorPin(container: Element): ResolvedTheme | undefined {
  const attr = container.closest('[data-fg-theme]')?.getAttribute('data-fg-theme');
  return attr === 'light' || attr === 'dark' ? attr : undefined;
}

/** `resolveTheme`'s own read of the OS, injected rather than a direct `window.matchMedia` call —
 *  a test drives this with no real OS preference to read (#330 grill: `closest()` plus injected
 *  `matchMedia`, not `getComputedStyle().colorScheme` — happy-dom does not parse `@layer`, so the
 *  computed-style route would ship with no CI coverage). `GanttShell` supplies the real
 *  `window.matchMedia`; a test supplies a fake one instead. */
export type MatchMedia = (query: string) => Pick<MediaQueryList, 'matches'>;

/** What `Gantt.theme` resolves to right now: the nearest explicit pin, else the OS. */
export function resolveTheme(container: Element, matchMedia: MatchMedia): ResolvedTheme {
  return ancestorPin(container) ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}
