// api/ — #191: `PluginContextOf` is `PluginContextParts<TGantt, TDataset>` plus `dataset` and
// `gantt`. Both members that bind those two type arguments — `commands` and
// `interaction.registerKeybinding` — are declared with the rest, in `view/plugin-ports.ts`. So the
// public `PluginContextParts` is the plugin surface, and naming it is legal.
//
// Before this, those two members were declared unbound there and `Omit`ed back out here. A consumer
// naming `PluginContextParts` then got `CommandRegistryOf<unknown>`, which is wrong for every
// consumer of it. The assignment and the two callback bodies below stop compiling if either member
// goes back to its unbound form: `ctx.gantt` and `ctx.dataset` are then `unknown`.

import { describe, expect, it } from 'vitest';
import { Gantt } from './gantt.js';
import { Dataset } from './dataset.js';
import type { ChromePlugin, PluginContextParts } from './index.js';
import { sampleEntries } from '../../fixtures/sample-dataset.js';

describe('PluginContextParts is the plugin surface, with both type arguments bound (#191)', () => {
  it('a plugin reads its own context through the Parts type, and both members stay typed', () => {
    let selectionCount = -1;

    const plugin: ChromePlugin = {
      id: 'demo.parts',
      view(ctx) {
        // The one assignment this test exists for: a `PluginContext` *is* a bound
        // `PluginContextParts`, with no member re-typed on the way out.
        const parts: PluginContextParts<Gantt, Dataset> = ctx;
        parts.commands.register({
          id: 'demo.countSelection',
          label: 'Count selection',
          run: (commandCtx) => {
            selectionCount = commandCtx.gantt.selectedEntryIds.length + commandCtx.dataset.entries.all.length;
          },
        });
        parts.interaction.registerKeybinding({
          chord: 'Mod+K',
          command: 'demo.countSelection',
          when: (commandCtx) => commandCtx.dataset.timeZone === 'UTC',
        });
        return () => {};
      },
    };

    const container = document.createElement('div');
    const gantt = new Gantt({
      container,
      dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }),
      plugins: [plugin],
    });

    gantt.commands.run('demo.countSelection');
    expect(selectionCount).toBe(sampleEntries.length);

    gantt.destroy();
  });
});
