/** Derivation seam. A row derives when it has children. Kind stays authored. */

import type { Entry, Instant } from './types.js';
import { hasDates } from './dates.js';
import type { DeclaredFields } from './props.js';

export function childrenOf(rows: Map<string, Entry>, parentId: string): Entry[] {
  return [...rows.values()].filter((row) => row.parentId === parentId);
}

export function followChildrenOf(entry: Entry): boolean {
  return entry.followChildren !== false;
}

export function rollupCost(children: readonly Entry[]): number | undefined {
  let sum = 0;
  let any = false;
  for (const child of children) {
    if (child.props.cost !== undefined) {
      sum += child.props.cost;
      any = true;
    }
  }
  return any ? sum : undefined;
}

export function rollupSpan(children: readonly Entry[]): { start?: Instant; end?: Instant } {
  let start: Instant | undefined;
  let end: Instant | undefined;
  for (const child of children) {
    if (!hasDates(child)) continue;
    if (start === undefined || child.start! < start) start = child.start;
    if (end === undefined || child.end! > end) end = child.end;
  }
  return { start, end };
}

/** Improvement D: parent becomes dateless when every child is dateless. */
export type RollupEnvelope =
  | { kind: 'set'; start: Instant; end: Instant; segments: { start: Instant; end: Instant }[] }
  | { kind: 'clear' }
  | { kind: 'keep' };

export function rollupEnvelope(
  children: readonly Entry[],
  rule: 'keep-stale' | 'clear-when-all-dateless' = 'clear-when-all-dateless',
): RollupEnvelope {
  const dated = children.filter(hasDates);
  if (dated.length === 0) {
    return rule === 'clear-when-all-dateless' ? { kind: 'clear' } : { kind: 'keep' };
  }
  const span = rollupSpan(dated);
  if (span.start === undefined || span.end === undefined) return { kind: 'clear' };
  return {
    kind: 'set',
    start: span.start,
    end: span.end,
    segments: [{ start: span.start, end: span.end }],
  };
}

export function clearDerivedStored(row: Entry, declared: DeclaredFields): Entry {
  const next = { ...row, props: { ...row.props } };
  if (declared.rollsUp('cost')) delete next.props.cost;
  delete next.start;
  delete next.end;
  delete next.segments;
  return next;
}

export function applyRollup(
  row: Entry,
  children: readonly Entry[],
  declared: DeclaredFields,
  derives: boolean,
  envelopeRule: 'keep-stale' | 'clear-when-all-dateless' = 'clear-when-all-dateless',
): Entry {
  if (!derives) return { ...row, props: { ...row.props } };

  const next = { ...row, props: { ...row.props } };
  if (declared.rollsUp('cost')) {
    const cost = rollupCost(children);
    if (cost !== undefined) next.props.cost = cost;
    else delete next.props.cost;
  }

  const env = rollupEnvelope(children, envelopeRule);
  if (env.kind === 'set') {
    next.start = env.start;
    next.end = env.end;
    next.segments = env.segments;
  } else if (env.kind === 'clear') {
    delete next.start;
    delete next.end;
    delete next.segments;
  }

  return next;
}

export function dropDerivedOnIngest(
  entry: Entry,
  derives: boolean,
  declared: DeclaredFields,
): Entry {
  if (!derives) return entry;
  const next = { ...entry, props: { ...entry.props } };
  if (declared.rollsUp('cost')) delete next.props.cost;
  delete next.start;
  delete next.end;
  delete next.segments;
  return next;
}
