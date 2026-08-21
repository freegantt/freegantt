// model/ is types + brand/id helpers only — zero runtime beyond this, zero dependencies (plans/01 §1.1).

export type TaskId = string & { readonly __brand: 'TaskId' };
export type DependencyId = string & { readonly __brand: 'DependencyId' };
export type RowId = string & { readonly __brand: 'RowId' };
export type ItemId = string & { readonly __brand: 'ItemId' };

export function taskId(value: string): TaskId {
  return value as TaskId;
}

export function dependencyId(value: string): DependencyId {
  return value as DependencyId;
}

export function rowId(value: string): RowId {
  return value as RowId;
}

/** Item.id = `${taskId}:${segmentIndex ?? 0}` — deterministic across layout passes (plans/01 §2.4). */
export function itemId(task: TaskId, segmentIndex = 0): ItemId {
  return `${task}:${segmentIndex}` as ItemId;
}
