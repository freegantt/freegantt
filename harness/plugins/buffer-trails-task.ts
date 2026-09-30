// harness/plugins/ — written as if by a third party: everything below comes from 'freegantt', the
// package's own public entry, never a path inside 'freegantt/src'. Dogfoods the edit extender and
// the removal extender: one plugin, two jobs, and both ride the write that caused them.

import { definePlugin, entryId, mergeEntryEdits, moveEntryTo } from 'freegantt';
import type { EditExtender, EntryEdit, EntryId, RemovalExtender } from 'freegantt';

/** The key this plugin declares. A buffer holds the id of the task it trails. */
export interface BufferTrailsTaskProps {
  bufferOf?: string;
}

/**
 * A buffer trails its task: the buffer starts where its task ends, and it leaves with its task.
 *
 * ```ts
 * const dataset = new Dataset({ entries, plugins: [bufferTrailsTask()] });
 * // entries: { id: 'buffer', props: { bufferOf: 'task' } } trails the Entry 'task'.
 * ```
 *
 * The rule: a write that changes a task's `end` moves its buffer to start at that `end`, and
 * removing the task removes the buffer. Both ride the same change set, so one undo restores both.
 */
export function bufferTrailsTask() {
  return definePlugin<BufferTrailsTaskProps>({
    id: 'demo.bufferTrailsTask',
    fields: [{ key: 'bufferOf' }],

    data(ctx) {
      // Does a write move a task's end? Then its buffer starts at the new end.
      const buffersFollowTasks: EditExtender<BufferTrailsTaskProps> = (request) => {
        const moves = new Map<EntryId, EntryEdit>();
        for (const buffer of request.entries.values()) {
          const taskId = buffer.props.bufferOf;
          if (taskId === undefined || request.proposed.has(buffer.id)) continue;
          if (request.proposed.get(entryId(taskId))?.end === undefined) continue;
          const taskEnd = request.entryAfterEdits(taskId)?.end;
          if (taskEnd !== undefined) moves.set(buffer.id, moveEntryTo(buffer, taskEnd));
        }
        return moves;
      };
      ctx.edits.setExtender(
        (next) => (request) => mergeEntryEdits(next(request), buffersFollowTasks(request)),
      );

      // Does a write remove a task? Then its buffer goes too.
      const buffersLeaveWithTasks: RemovalExtender<BufferTrailsTaskProps> = (request) => {
        const leaving = new Set<EntryId>();
        for (const buffer of request.entries.values()) {
          const taskId = buffer.props.bufferOf;
          if (taskId !== undefined && request.removedEntryIds.has(entryId(taskId))) leaving.add(buffer.id);
        }
        return leaving;
      };
      ctx.edits.setRemovalExtender(
        (next) => (request) => new Set([...next(request), ...buffersLeaveWithTasks(request)]),
      );
    },
  });
}
