/**
 * Combined store. One façade. Internals split by seam.
 * Call: `const store = new CombinedStore({ fields: [...] });`
 */

import { omitEnvelopeForJson, reconcileEnvelope } from './dates.js';
import {
  applyRollup,
  childrenOf,
  clearDerivedStored,
  dropDerivedOnIngest,
  followChildrenOf,
} from './derivation.js';
import {
  ChildAddWouldWidenLockedParentError,
  DocumentMigrationReport,
  PluginFieldCollisionError,
} from './errors.js';
import { composeExtenders, type EditExtender, identityExtender } from './extender.js';
import { encodeFieldsForJson, parseFieldDecls } from './lock.js';
import { mergeProps } from './merge.js';
import {
  applyPropsPatch,
  assertDeclaredPatch,
  assertTopLevelClosed,
  consumerPatch,
  DeclaredFields,
} from './props.js';
import { resolveWrite, derives as rowDerives, type WriteDoor } from './write-resolver.js';
import type { Doc, Entry, FieldDecl, Write } from './types.js';

export type CombinedStoreOptions = {
  fields: readonly FieldDecl[];
  extenders?: readonly { name: string; fn: EditExtender }[];
  envelopeRule?: 'keep-stale' | 'clear-when-all-dateless';
};

export class CombinedStore {
  readonly #rows = new Map<string, Entry>();
  readonly #declared: DeclaredFields;
  readonly #coreOverrides: Map<string, boolean>;
  readonly #fieldDecls: FieldDecl[];
  readonly #extenders: readonly { name: string; fn: EditExtender }[];
  readonly #envelopeRule: 'keep-stale' | 'clear-when-all-dateless';
  #n = 0;
  #warnings: string[] = [];
  #lastMigrationReport: DocumentMigrationReport | undefined;

  constructor(options: CombinedStoreOptions) {
    const parsed = parseFieldDecls(options.fields);
    this.#fieldDecls = parsed.fields;
    this.#coreOverrides = parsed.coreOverrides;
    this.#declared = new DeclaredFields(parsed.fields);
    this.#extenders = options.extenders ?? [];
    this.#envelopeRule = options.envelopeRule ?? 'clear-when-all-dateless';
  }

  get warnings(): readonly string[] {
    return this.#warnings;
  }

  get lastMigrationReport(): DocumentMigrationReport | undefined {
    return this.#lastMigrationReport;
  }

  get declared(): DeclaredFields {
    return this.#declared;
  }

  add(write: Write, door: WriteDoor = 'add'): Entry {
    const id = write.id ?? `e${++this.#n}`;
    let entry: Entry = {
      id,
      name: typeof write.name === 'string' ? write.name : '',
      kind: write.kind ?? 'span',
      props: {},
    };
    if (write.parentId !== undefined) entry.parentId = write.parentId;
    if (write.followChildren === false) entry.followChildren = false;

    this.#assertWrite(write, id, door);
    entry = reconcileEnvelope(entry, write);
    const patch = this.#foldPatch(write, door);
    entry.props = mergeProps(entry.props, patch);

    if (write.parentId !== undefined) {
      this.#assertChildAddDoesNotWidenLockedParent(write.parentId, entry);
    }

    this.#rows.set(id, entry);
    this.#afterStructure(write.parentId);
    this.#afterStructure(id);
    return this.get(id);
  }

  update(id: string, write: Write, door: WriteDoor = 'update'): Entry {
    const base = this.#must(id);
    this.#assertWrite(write, id, door);
    assertTopLevelClosed(write, this.#declared);

    let entry: Entry = { ...base, props: { ...base.props } };
    if (typeof write.name === 'string') entry.name = write.name;
    if ('parentId' in write) entry.parentId = write.parentId;
    if ('kind' in write && write.kind !== undefined) entry.kind = write.kind;
    if ('followChildren' in write) entry.followChildren = write.followChildren;

    entry = reconcileEnvelope(entry, write);
    const patch = this.#foldPatch(write, door);
    for (const key of Object.keys(patch)) this.#guardPluginCollision(key);
    assertDeclaredPatch(patch, this.#declared);
    entry.props = applyPropsPatch(entry.props, patch);

    this.#rows.set(id, entry);
    this.#afterStructure(base.parentId);
    this.#afterStructure(entry.parentId);
    this.#afterStructure(id);
    return this.get(id);
  }

  remove(id: string): void {
    const row = this.#must(id);
    const parentId = row.parentId;
    this.#rows.delete(id);
    if (parentId !== undefined) {
      this.#afterStructure(parentId);
      if (childrenOf(this.#rows, parentId).length === 0) {
        this.#rows.set(parentId, clearDerivedStored(this.#must(parentId), this.#declared));
      }
    }
  }

  get(id: string): Entry {
    const row = this.#must(id);
    const kids = childrenOf(this.#rows, id);
    const ctx = this.#ctx(id, kids);
    if (!rowDerives(ctx)) return { ...row, props: { ...row.props } };
    return applyRollup({ ...row, props: { ...row.props } }, kids, this.#declared, true, this.#envelopeRule);
  }

  derives(id: string): boolean {
    return rowDerives(this.#ctx(id, childrenOf(this.#rows, id)));
  }

  childrenOf(id: string): Entry[] {
    return childrenOf(this.#rows, id);
  }

  toJSON(): Doc {
    return {
      schema: 7,
      fields: encodeFieldsForJson(this.#fieldDecls, this.#coreOverrides),
      entries: [...this.#rows.values()].map((row) => {
        const derives = this.derives(row.id);
        const omitDates = derives;
        const base = omitEnvelopeForJson(row, omitDates);
        if (derives) {
          const props = { ...base.props };
          for (const key of this.#declared.keys()) {
            if (this.#declared.rollsUp(key)) delete (props as Record<string, unknown>)[key];
          }
          return { ...base, props };
        }
        return base;
      }),
    };
  }

  fromJSON(doc: Doc): DocumentMigrationReport | undefined {
    this.#rows.clear();
    this.#warnings = [];
    const messages: string[] = [];

    if (doc.rollUpKinds !== undefined && doc.rollUpKinds.length === 0) {
      messages.push(
        'Document carries rollUpKinds: []. Structure-only ignores it. Parents with children will derive. Use followChildren: false per parent to opt out.',
      );
    }

    if (doc.fields) {
      for (const field of doc.fields) {
        if ((field.key === 'start' || field.key === 'end') && 'editable' in field) {
          this.#coreOverrides.set(field.key, field.editable === false ? false : true);
        }
      }
    }

    for (const row of doc.entries) {
      const input: Write = {
        id: row.id,
        name: row.name,
        parentId: row.parentId,
        kind: row.kind,
        followChildren: row.followChildren,
        start: row.start,
        end: row.end,
        props: row.props,
      };
      const added = this.add(input, 'ingest');
      const derives = this.derives(added.id);
      if (derives) {
        this.#warnings.push(`ingest dropped derived values on ${added.id}`);
        const dropped = dropDerivedOnIngest(added, true, this.#declared);
        this.#rows.set(added.id, dropped);
        this.#afterStructure(added.parentId);
      }
    }

    const report = messages.length > 0 ? new DocumentMigrationReport(messages) : undefined;
    this.#lastMigrationReport = report;
    return report;
  }

  #foldPatch(write: Write, door: WriteDoor): Record<string, unknown> {
    if (door === 'update') {
      assertTopLevelClosed(write, this.#declared);
    }
    return consumerPatch(write, this.#declared) as Record<string, unknown>;
  }

  #assertWrite(write: Write, id: string, door: WriteDoor): void {
    const row = this.#rows.get(id);
    const kids = row ? childrenOf(this.#rows, id) : [];
    const ctx = {
      door,
      id,
      hasChildren: kids.length > 0,
      followChildren: row ? followChildrenOf(row) : true,
    };

    for (const key of Object.keys(write)) {
      if (key === 'id' || key === 'name' || key === 'props') continue;
      if (this.#declared.has(key)) {
        this.#guardPluginCollision(key);
        resolveWrite(key, this.#declared, ctx);
      }
      if (key === 'start' || key === 'end') {
        resolveWrite(key, this.#declared, ctx, {
          coreLocked: this.#coreOverrides.get(key) === false,
        });
      }
    }

    const patch = write.props ?? {};
    for (const key of Object.keys(patch)) {
      this.#guardPluginCollision(key);
      resolveWrite(key, this.#declared, ctx);
    }
  }

  #guardPluginCollision(key: string): void {
    const plugin = this.#declared.pluginOwnerOf(key);
    if (plugin !== undefined) throw new PluginFieldCollisionError(plugin, key);
  }

  #assertChildAddDoesNotWidenLockedParent(parentId: string, child: Entry): void {
    const parent = this.#rows.get(parentId);
    if (!parent) return;
    if (this.#coreOverrides.get('start') === false && child.start !== undefined && parent.start !== undefined) {
      if (child.start < parent.start || (child.end !== undefined && parent.end !== undefined && child.end > parent.end)) {
        throw new ChildAddWouldWidenLockedParentError(parentId, 'start');
      }
    }
  }

  #ctx(id: string, kids: Entry[], door: WriteDoor = 'update') {
    const row = this.#must(id);
    return {
      door,
      id,
      hasChildren: kids.length > 0,
      followChildren: followChildrenOf(row),
    };
  }

  #afterStructure(parentId: string | undefined): void {
    if (parentId === undefined || !this.#rows.has(parentId)) return;
    const row = this.#must(parentId);
    const kids = childrenOf(this.#rows, parentId);
    const ctx = this.#ctx(parentId, kids);
    if (!rowDerives(ctx)) return;
    const next = applyRollup(row, kids, this.#declared, true, this.#envelopeRule);
    this.#rows.set(parentId, next);
  }

  #must(id: string): Entry {
    const row = this.#rows.get(id);
    if (!row) throw new Error(`unknown entry ${id}`);
    return row;
  }

  /** History replay is not a user change. Locked start still writes. */
  replay(id: string, write: Write): Entry {
    return this.update(id, write, 'replay');
  }

  runExtenders(proposed: Parameters<typeof composeExtenders>[1]): Map<string, { props?: Record<string, unknown> }> {
    return composeExtenders(this.#extenders.length ? this.#extenders : [{ name: 'identity', fn: identityExtender }], proposed);
  }
}
