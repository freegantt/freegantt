// scheduling/ — orders Entries so every predecessor comes before its successors, and finds the loops.
// This file contains no recursive call. Chain depth is unbounded by design.

/** A group of nodes the order treats as one step. More than one node, or a self-edge, means a loop. */
export interface OrderStep {
  readonly nodes: readonly number[];
  readonly isLoop: boolean;
}

interface Frame {
  readonly node: number;
  nextEdge: number;
}

/**
 * Orders `nodeCount` nodes by `successors` (`successors[n]` lists the nodes n points to).
 * Uses Tarjan's strongly connected components with an explicit stack. Tarjan emits a component only
 * after every component it points to, so the reversed emission order puts predecessors first.
 * Ties follow node order, so the answer is deterministic.
 */
export function orderByDependency(
  nodeCount: number,
  successors: readonly (readonly number[])[],
): OrderStep[] {
  const UNVISITED = -1;
  const discovery = new Array<number>(nodeCount).fill(UNVISITED);
  const lowLink = new Array<number>(nodeCount).fill(0);
  const onStack = new Array<boolean>(nodeCount).fill(false);
  const componentStack: number[] = [];
  const emitted: OrderStep[] = [];
  let clock = 0;

  const open = (node: number, frames: Frame[]): void => {
    discovery[node] = clock;
    lowLink[node] = clock;
    clock += 1;
    componentStack.push(node);
    onStack[node] = true;
    frames.push({ node, nextEdge: 0 });
  };

  const close = (node: number): void => {
    if (lowLink[node] !== discovery[node]) return;
    const nodes: number[] = [];
    let member: number;
    do {
      member = componentStack.pop() as number;
      onStack[member] = false;
      nodes.push(member);
    } while (member !== node);
    nodes.sort((a, b) => a - b);
    const selfEdge = nodes.length === 1 && (successors[node] ?? []).includes(node);
    emitted.push({ nodes, isLoop: nodes.length > 1 || selfEdge });
  };

  for (let root = 0; root < nodeCount; root += 1) {
    if (discovery[root] !== UNVISITED) continue;
    const frames: Frame[] = [];
    open(root, frames);
    while (frames.length > 0) {
      const frame = frames[frames.length - 1] as Frame;
      const edges = successors[frame.node] ?? [];
      if (frame.nextEdge < edges.length) {
        const target = edges[frame.nextEdge] as number;
        frame.nextEdge += 1;
        if (discovery[target] === UNVISITED) open(target, frames);
        else if (onStack[target])
          lowLink[frame.node] = Math.min(lowLink[frame.node] as number, discovery[target] as number);
        continue;
      }
      frames.pop();
      close(frame.node);
      const parent = frames[frames.length - 1];
      if (parent)
        lowLink[parent.node] = Math.min(lowLink[parent.node] as number, lowLink[frame.node] as number);
    }
  }
  return emitted.reverse();
}
