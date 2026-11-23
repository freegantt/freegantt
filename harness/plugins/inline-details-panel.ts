// harness/plugins/ — written as a third party would: everything below comes from 'freegantt'.
// The plugin opens one details panel under a row. The panel spans the grid pane and the timeline
// pane together. The consumer pushes the rows below it down with a bar-less spacer entry and the
// live `rowHeight` callback. This plugin only places the panel, with `ctx.view.rowBox`.
import { definePlugin } from 'freegantt';
import type { ChromePlugin } from 'freegantt';

export const PANEL_HEIGHT_PX = 132;

/** The spacer entry that sits after a task and holds the room for its panel. */
export function spacerIdFor(taskId: string): string {
  return `${taskId}:panel`;
}

export interface InlineDetailsPlugin extends ChromePlugin {
  /** Shows the panel for this task. `undefined` closes it. */
  show(taskId: string | undefined): void;
  /** How many times the rows moved since mount. The page shows it. */
  readonly layoutChanges: number;
}

/** `describe` answers the lines the panel shows for one task. */
export function inlineDetailsPanel(
  describe: (taskId: string) => { title: string; lines: readonly string[] },
  onClose: () => void,
): InlineDetailsPlugin {
  let place: () => void = () => {};
  let openFor: string | undefined;
  let layoutChanges = 0;

  const plugin = definePlugin({
    id: 'demo.inlineDetailsPanel',
    view(ctx) {
      const panel = document.createElement('section');
      panel.className = 'demo-details-panel';
      panel.setAttribute('aria-label', 'Task details');
      panel.hidden = true;

      const title = document.createElement('h3');
      const lines = document.createElement('p');
      const note = document.createElement('input');
      note.type = 'text';
      note.placeholder = 'Add a note';
      note.setAttribute('aria-label', 'Note');
      // Longer than its box, so a wheel over it scrolls the text and not the rows.
      const notes = document.createElement('textarea');
      notes.setAttribute('aria-label', 'Notes');
      notes.rows = 2;
      notes.value = Array.from({ length: 12 }, (_unused, index) => `Note line ${index + 1}`).join('\n');
      const close = document.createElement('button');
      close.type = 'button';
      close.textContent = 'Close';
      close.addEventListener('click', onClose);
      panel.append(title, lines, note, notes, close);

      place = () => {
        const box = openFor === undefined ? undefined : ctx.view.rowBox(spacerIdFor(openFor));
        panel.hidden = box === undefined;
        if (openFor === undefined || box === undefined) return;
        const details = describe(openFor);
        title.textContent = details.title;
        lines.textContent = details.lines.join(' · ');
        panel.style.top = `${box.top}px`;
        panel.style.height = `${box.height}px`;
      };

      ctx.disposables.add(ctx.view.rowSpanLayer.present(panel));
      ctx.disposables.add(ctx.view.rowSpanLayer.onResize(place));
      // A row's top moves with a collapse, a filter, a data change or a new height, and never with a scroll.
      ctx.disposables.add(
        ctx.view.onRowLayout(() => {
          layoutChanges += 1;
          place();
        }),
      );
    },
  });

  const shown = Object.assign(plugin, {
    show(taskId: string | undefined) {
      openFor = taskId;
      place();
    },
  });
  // A getter, so the page reads the live count. `Object.assign` would copy it once.
  return Object.defineProperty(shown, 'layoutChanges', { get: () => layoutChanges }) as InlineDetailsPlugin;
}
