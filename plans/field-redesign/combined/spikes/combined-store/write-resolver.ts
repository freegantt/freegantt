/** One write resolver. Order: exists → compute → derived → editable. Improvement H. */

import {
  ComputedFieldCannotBeWrittenError,
  DerivedFieldNotWritableError,
  FieldNotEditableError,
} from './errors.js';
import type { DeclaredFields } from './props.js';

export type WriteDoor = 'update' | 'add' | 'ingest' | 'replay' | 'grid';

export type WriteContext = {
  door: WriteDoor;
  id: string;
  hasChildren: boolean;
  followChildren: boolean;
};

/** Does this Field exist on the registry? */
function existsArm(key: string, declared: DeclaredFields): boolean {
  return (
    declared.has(key) ||
    key === 'name' ||
    key === 'parentId' ||
    key === 'kind' ||
    key === 'followChildren'
  );
}

/**
 * One function, three arms after exists, one order.
 * Grid and update both call this. Improvement H.
 */
export function resolveWrite(
  key: string,
  declared: DeclaredFields,
  ctx: WriteContext,
  options?: { coreLocked?: boolean },
): void {
  if (!existsArm(key, declared) && key !== 'start' && key !== 'end' && key !== 'segments') {
    return;
  }

  if (declared.isComputed(key)) {
    throw new ComputedFieldCannotBeWrittenError(key);
  }

  if (isDerivedField(key, declared, ctx)) {
    throw new DerivedFieldNotWritableError(ctx.id, key);
  }

  const editable = declared.isEditable(key);
  const locked = options?.coreLocked === true;
  if ((editable === false || locked) && isChangeDoor(ctx.door)) {
    throw new FieldNotEditableError(key);
  }
}

function isChangeDoor(door: WriteDoor): boolean {
  return door === 'update' || door === 'grid';
}

/** One derivation predicate: has children, unless followChildren is false. Improvement E. */
export function derives(ctx: WriteContext): boolean {
  if (!ctx.hasChildren) return false;
  if (ctx.followChildren === false) return false;
  return true;
}

function isDerivedField(key: string, declared: DeclaredFields, ctx: WriteContext): boolean {
  if (!declared.rollsUp(key) && key !== 'start' && key !== 'end') return false;
  return derives(ctx);
}

export function canWriteField(
  key: string,
  declared: DeclaredFields,
  ctx: WriteContext,
): boolean {
  try {
    resolveWrite(key, declared, ctx);
    return true;
  } catch {
    return false;
  }
}
