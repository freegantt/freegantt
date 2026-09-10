/** Grid calls the same write resolver as update. Improvement H. */

import { canWriteField, type WriteContext } from './write-resolver.js';
import type { DeclaredFields } from './props.js';

const GRID_COLUMN_KEYS = new Set(['kind', 'owner', 'cost', 'start', 'end']);

export function gridCanWrite(
  key: string,
  declared: DeclaredFields,
  ctx: Omit<WriteContext, 'door'>,
): boolean {
  if (GRID_COLUMN_KEYS.has(key) && declared.isEditable(key) === undefined) {
    return false;
  }
  return canWriteField(key, declared, { ...ctx, door: 'grid' });
}
