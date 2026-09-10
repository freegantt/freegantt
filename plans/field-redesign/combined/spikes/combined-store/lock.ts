/** Lock seam. editable: false refuses change, not create. Three field shapes for decision 23. */

import { IllegalCoreFieldOverrideError } from './errors.js';
import type { FieldDecl } from './types.js';

const CORE_OVERRIDE_ALLOWED = new Set(['editable']);

export function parseFieldDecls(
  fields: readonly FieldDecl[],
): { fields: FieldDecl[]; coreOverrides: Map<string, boolean> } {
  const out: FieldDecl[] = [];
  const coreOverrides = new Map<string, boolean>();

  for (const field of fields) {
    if (field.key === 'start' || field.key === 'end') {
      const extra = Object.keys(field).filter((k) => k !== 'key');
      const hasEditable = 'editable' in field;
      const hasColumn = extra.some((k) => k !== 'editable');
      if (hasColumn) {
        throw new IllegalCoreFieldOverrideError(field.key);
      }
      if (hasEditable && field.editable === false) {
        coreOverrides.set(field.key, false);
      }
      continue;
    }

    out.push(field);
  }

  return { fields: out, coreOverrides };
}

export function encodeFieldsForJson(
  fields: readonly FieldDecl[],
  coreOverrides: ReadonlyMap<string, boolean>,
): FieldDecl[] {
  const out: FieldDecl[] = [...fields];
  for (const [key, editable] of coreOverrides) {
    if (editable === false) out.push({ key, editable: false });
  }
  return out;
}

export function isCoreOverrideKey(key: string, field: FieldDecl): boolean {
  if (key !== 'start' && key !== 'end') return false;
  const keys = Object.keys(field).filter((k) => k !== 'key');
  return keys.every((k) => CORE_OVERRIDE_ALLOWED.has(k));
}
