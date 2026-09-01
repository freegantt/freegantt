// render/dom — row twisty hit target. Keeps `.fg-row-twisty`, `.fg-row`, and `data-row-id` out of
// view/ so a second backend can own its own control geometry without the shell reaching through.

/** When `target` is a twisty inside `pane`, returns that row's id. Otherwise undefined. */
export function rowIdFromTwistyClick(target: EventTarget | null, pane: HTMLElement): string | undefined {
  if (!(target instanceof Element)) return undefined;
  const twisty = target.closest('.fg-row-twisty');
  if (twisty === null || !pane.contains(twisty)) return undefined;
  const row = twisty.closest('.fg-row');
  if (!(row instanceof HTMLElement)) return undefined;
  return row.dataset['rowId'];
}
