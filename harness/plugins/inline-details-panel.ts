// harness/plugins/ — written as a third party would: everything below comes from 'freegantt'.
// The plugin opens one details panel under a row. The panel spans the grid pane and the timeline
// pane together. `ctx.view.presentRowDetail` measures the panel, pushes the rows below it down
// and keeps it with its row.
import { definePlugin } from 'freegantt';
import type { ChromePlugin, Disposer } from 'freegantt';

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
  let present: (taskId: string) => Disposer = () => () => {};
  let closeDetail: Disposer = () => {};
  let layoutChanges = 0;

  const plugin = definePlugin({
    id: 'demo.inlineDetailsPanel',
    view(ctx) {
      present = (taskId) => {
        const details = describe(taskId);
        const panel = document.createElement('section');
        panel.className = 'demo-details-panel';
        panel.setAttribute('aria-label', 'Task details');

        const title = document.createElement('h3');
        title.textContent = details.title;
        const lines = document.createElement('p');
        // The Gantt writes `--fg-timeline-pane-left` and `--fg-timeline-pane-width` for this line.
        lines.className = 'demo-details-timeline-line';
        lines.textContent = details.lines.join(' · ');
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

        return ctx.view.presentRowDetail(taskId, panel);
      };
      // A row's top moves with a collapse, a filter, a data change or a new height, and never with a scroll.
      ctx.disposables.add(ctx.view.onRowLayout(() => (layoutChanges += 1)));
    },
  });

  const shown = Object.assign(plugin, {
    show(taskId: string | undefined) {
      closeDetail();
      closeDetail = taskId === undefined ? () => {} : present(taskId);
    },
  });
  // A getter, so the page reads the live count. `Object.assign` would copy it once.
  return Object.defineProperty(shown, 'layoutChanges', { get: () => layoutChanges }) as InlineDetailsPlugin;
}
