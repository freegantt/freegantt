/** Props seam. Records carry. Patches name. Declared-key shorthand. */

import {
  FieldNamedAtTopAndInPropsError,
  UndeclaredPropsKeyError,
  UnknownFieldError,
} from './errors.js';
import { mergeProps } from './merge.js';
import type { EntryProps, PropsEdit, Write } from './types.js';
import { CORE_EDIT_KEYS } from './types.js';

export class DeclaredFields {
  readonly #keys = new Set<string>();
  readonly #rollUp = new Map<string, 'sum' | 'min' | 'max'>();
  readonly #compute = new Set<string>();
  readonly #editable = new Map<string, boolean>();

  constructor(declared: readonly { key: string; rollUp?: 'sum' | 'min' | 'max'; editable?: boolean; compute?: boolean }[]) {
    for (const field of declared) {
      this.#keys.add(field.key);
      if (field.rollUp) this.#rollUp.set(field.key, field.rollUp);
      if (field.compute) this.#compute.add(field.key);
      if (field.editable !== undefined) this.#editable.set(field.key, field.editable);
    }
  }

  has(key: string): boolean {
    return this.#keys.has(key);
  }

  rollsUp(key: string): boolean {
    return this.#rollUp.has(key);
  }

  rollUpKind(key: string): 'sum' | 'min' | 'max' | undefined {
    return this.#rollUp.get(key);
  }

  isComputed(key: string): boolean {
    return this.#compute.has(key);
  }

  isEditable(key: string): boolean | undefined {
    return this.#editable.get(key);
  }

  keys(): Iterable<string> {
    return this.#keys;
  }

  /** Bare `progress` is owned when a declared key is `plugin:progress`. */
  pluginOwnerOf(key: string): string | undefined {
    if (key.includes(':')) return undefined;
    for (const declared of this.#keys) {
      const colon = declared.indexOf(':');
      if (colon <= 0) continue;
      if (declared.slice(colon + 1) === key) return declared.slice(0, colon);
    }
    return undefined;
  }
}

export function proposedKeysByPresence(patch: PropsEdit): Set<string> {
  const keys = new Set<string>();
  for (const key of Object.keys(patch)) {
    if (key in patch) keys.add(key);
  }
  return keys;
}

/** Fold declared top-level keys into the props patch. */
export function consumerPatch(write: Write, declared: DeclaredFields): PropsEdit {
  const patch: PropsEdit = { ...(write.props ?? {}) };
  for (const key of Object.keys(write)) {
    if (!declared.has(key)) continue;
    if (write.props !== undefined && key in write.props) {
      throw new FieldNamedAtTopAndInPropsError(key);
    }
    const value = write[key as keyof Write];
    if (value !== undefined) {
      (patch as Record<string, unknown>)[key] = value;
    } else if (key in write) {
      delete (patch as Record<string, unknown>)[key];
    }
  }
  return patch;
}

export function assertTopLevelClosed(write: Write, declared: DeclaredFields): void {
  for (const key of Object.keys(write)) {
    if (CORE_EDIT_KEYS.has(key)) continue;
    if (declared.has(key)) continue;
    throw new UnknownFieldError(key);
  }
}

export function assertDeclaredPatch(patch: PropsEdit, declared: DeclaredFields): void {
  for (const key of Object.keys(patch)) {
    if (!declared.has(key)) throw new UndeclaredPropsKeyError(key);
  }
}

export function applyPropsPatch(base: EntryProps, patch: PropsEdit): EntryProps {
  return mergeProps(base, patch);
}

export function ingestProps(write: Write, declared: DeclaredFields): EntryProps {
  const patch = consumerPatch(write, declared);
  for (const key of Object.keys(patch)) {
    if (!declared.has(key)) continue;
  }
  return patch;
}
