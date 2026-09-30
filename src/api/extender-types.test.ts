import { describe, it, expect } from 'vitest';
import { definePlugin } from './define-plugin.js';
import { moveEntryTo } from './dataset-plugin.js';
import type { EntryId } from './index.js';

// Compile-first, like `dataset-options-types.test.ts`: the assertions are the type checker's job.
// An extender written in `definePlugin<TProps>` reads its own Fields with their declared types.
interface PlannerProps {
  x?: string;
}

describe('an extender reads its own Field typed', () => {
  it('compiles: an edit extender reads props.x as string | undefined with no cast', () => {
    const plugin = definePlugin<PlannerProps>({
      id: 'planner',
      fields: [{ key: 'x' }],
      data(ctx) {
        ctx.edits.setExtender(() => (request) => {
          const after: string | undefined = request.entryAfterEdits('a')?.props.x;
          const before: string | undefined = request.entries.get('a' as EntryId)?.props.x;
          // @ts-expect-error `y` is no prop this plugin declares
          void request.entryAfterEdits('a')?.props.y;
          const entry = request.entries.get('a' as EntryId);
          if (entry?.start !== undefined) moveEntryTo(entry, entry.start);
          void after;
          void before;
          return new Map();
        });
      },
    });
    expect(plugin).toBeDefined();
  });

  it('compiles: a removal extender reads props.x as string | undefined with no cast', () => {
    const plugin = definePlugin<PlannerProps>({
      id: 'planner-removal',
      fields: [{ key: 'x' }],
      data(ctx) {
        ctx.edits.setRemovalExtender(() => (request) => {
          const after: string | undefined = request.entryAfterEdits('a')?.props.x;
          const before: string | undefined = request.entries.get('a' as EntryId)?.props.x;
          // @ts-expect-error `y` is no prop this plugin declares
          void request.entries.get('a' as EntryId)?.props.y;
          void after;
          void before;
          return new Set<EntryId>();
        });
      },
    });
    expect(plugin).toBeDefined();
  });
});
