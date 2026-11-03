// scheduling/ — the chain of predecessors that sets one Entry's position. Pure and iterative.
import { entryId as toEntryId } from '../model/index.js';
import type { EntryId } from '../model/index.js';
import { anchorField, buildFloatGraph, drivenField } from './float-graph.js';
import type { FloatEdge, FloatGraph, FloatRequest } from './float-graph.js';

/**
 * The Entry ids from the head of the chain down to `entryId`, which comes last. At each step the
 * driving predecessor is the one whose Dependency holds with no slack, so moving it moves the Entry.
 * An Entry that no Dependency holds in place gives a path of itself alone.
 * An unknown Entry, a summary Entry, an undated Entry and a member of a loop give an empty path.
 */
export function findDrivingPath(request: FloatRequest, entryId: EntryId | string): readonly EntryId[] {
  const graph = buildFloatGraph(request);
  const start = graph.indexById.get(toEntryId(entryId));
  if (start === undefined || graph.nodes[start]?.inLoop) return [];

  const incoming = graph.nodes.map(() => [] as FloatEdge[]);
  for (const edge of graph.edges) incoming[edge.to]?.push(edge);

  const path: EntryId[] = [];
  const visited = new Set<number>();
  for (let index: number | undefined = start; index !== undefined && !visited.has(index);) {
    visited.add(index);
    path.push(graph.nodes[index]?.id as EntryId);
    index = (incoming[index] ?? []).find((edge) => holdsWithNoSlack(graph, edge))?.from;
  }
  return path.reverse();
}

/** Does the Dependency put its successor exactly where the successor is now? */
function holdsWithNoSlack(graph: FloatGraph, edge: FloatEdge): boolean {
  const predecessor = graph.nodes[edge.from];
  const successor = graph.nodes[edge.to];
  if (!predecessor || !successor) return false;
  const { type, lag } = edge.dependency;
  const driven = drivenField(type);
  const required = successor.days.lagLanding(predecessor[anchorField(type)], lag, driven);
  return required !== undefined && required === successor.days.settle(driven, successor[driven]);
}
