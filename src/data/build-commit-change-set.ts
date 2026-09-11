// data/ — the five-stage commit pipeline (C1): body edits → extension hook → autoGroup promotion →
// rollup → fold. The only module that imports `rollup.ts` and `hierarchy.ts` on the commit path
// (`rollup-is-removable`, `autogroup-is-removable`).

import type {
  ChangeOrigin,
  ChangeSet,
  ChangeSetId,
  DatasetHierarchy,
  EntityAdded,
  EntityRemoved,
  Entry,
  EntryId,
  EntryKind,
  FieldContext,
  FieldUpdated,
  SegmentId,
  StoredEdit,
  StoreRowUpdated,
} from '../model/index.js';
import { diffEdit, foldChangeSet } from './change-set.js';
import type { EditRequest, StoredEdits } from './edit-extension.js';
import { reconcileEnvelope, reconcileExtenderEdits } from './entry-reader.js';
import type { EditsReading } from './entry-reader.js';
import { buildEffectiveEntries } from './entry-tree.js';
import {
  mergeStoredEdits,
  mergeStoredEditsByEntry,
  entryAfterEdit,
  proposedKeysOf,
  statesProposedKeys,
} from './fields/field-access.js';
import type { FieldRegistry } from './fields/field-registry.js';
import { promoteNewParents } from './hierarchy.js';
import { rollUpFields } from './rollup.js';
import { isDevMode } from './dev-mode.js';

/** Staged entry-store state the commit pipeline reads — mirrors `TransactionalEntryStore` without
 *  importing `transaction.ts` (cycle avoidance). */
export interface CommitChangeSetEntryStore {
  committedById(): ReadonlyMap<EntryId, Entry>;
  pendingAdded(): readonly EntityAdded[];
  pendingRemoved(): readonly EntityRemoved[];
  pendingEdits(): StoredEdits;
  /** Which of `start`/`end`/`segments` the body itself named on each pending edit (#232) — see
   *  `EntryStore.pendingAuthoredEnvelopeKeys`. */
  pendingAuthoredEnvelopeKeys(): ReadonlyMap<EntryId, ReadonlySet<string>>;
}

/** Staged plugin-store state the commit pipeline reads — mirrors `TransactionalPluginStores` without
 *  importing `transaction.ts` (cycle avoidance). */
export interface CommitChangeSetPluginStores {
  pendingRows(removedEntryIds: readonly EntryId[]): readonly StoreRowUpdated[];
}

/** What `buildCommitChangeSet` reads off a transaction's staged state. */
export interface CommitChangeSetInput {
  readonly entries: CommitChangeSetEntryStore;
  readonly pluginStores: CommitChangeSetPluginStores;
  /** The commit path's own door onto the extension hook (#232) — see
   *  `TransactionData.extraEditsReadingFor`. */
  extraEditsReadingFor(request: EditRequest): EditsReading;
  readonly hierarchy: DatasetHierarchy;
  readonly fields: FieldRegistry;
  readonly fieldContext: FieldContext;
  readonly rollUpKinds: ReadonlySet<EntryKind>;
  nextChangeSetId(): ChangeSetId;
  /** The commit path's real counter (ADR 0012): a plugin's cascade that turns a dateless Entry
   *  spanning for the first time always mints a real `SegmentId` here, because this path always
   *  reaches the store. `entry-reader.ts`'s `reconcileExtenderEdits` is the one caller. */
  mintSegmentId(): SegmentId;
}

export function diffEdits(
  byId: ReadonlyMap<EntryId, Entry>,
  edits: StoredEdits,
  fields: FieldRegistry,
  ctx: FieldContext,
): FieldUpdated[] {
  const updated: FieldUpdated[] = [];
  for (const [id, edit] of edits) updated.push(...diffEdit(byId, id, edit, fields, ctx));
  return updated;
}

/** `start`/`end`/`segments` are the only keys `reconcileEnvelope` ever derives (D-S5-44) — the same
 *  triad `entry-reader.ts`'s own `authoredEnvelopeKeysOf` names. */
const ENVELOPE_FIELDS: ReadonlySet<string> = Object.freeze(new Set(['start', 'end', 'segments']));
const NO_ENVELOPE_KEYS: ReadonlySet<string> = Object.freeze(new Set<string>());

/** The label a `SegmentsOutOfSyncError` names when a body author's and an extender author's own
 *  envelope writes disagree (#232) — distinct from `entry-reader.ts`'s `EXTENDER_OPERATION`, because
 *  this refusal is not the hook's fault alone: either author's value could be the one that surprises
 *  a reader debugging it. */
const SHARED_ENVELOPE_OPERATION = 'transaction body and edit extender';

/** Which Fields an edit writes, however it states them: a storage key it holds, or a proposed key.
 *  `proposedKeys` is bookkeeping on the edit, never a Field, so it is not one of them (#197).
 *
 *  `meta` is the *container* a meta-sourced Field writes through, never a Field in its own right. An
 *  edit that states `proposedKeys` already names the real Field inside `meta`, so the raw loop skips
 *  `meta` for such an edit (#209) — including it unconditionally made two different meta-sourced
 *  Fields on one Entry intersect on "meta" and I4 refuse a transaction that writes no Field twice. An
 *  edit with no stated `proposedKeys` still needs the raw `meta` key, because nothing else names what
 *  it wrote. */
function fieldsWrittenBy(edit: StoredEdit): ReadonlySet<string> {
  const states = statesProposedKeys(edit);
  const keys = new Set<string>(proposedKeysOf(edit));
  for (const key of Object.keys(edit)) {
    if (key === 'proposedKeys') continue;
    if (states && key === 'meta') continue;
    keys.add(key);
  }
  return keys;
}

/** Which Fields an edit's *author* stated, for the I4 guard (#232). `fieldsWrittenBy` above answers
 *  that correctly for every Field except `start`/`end`/`segments`: `reconcileEnvelope` folds its own
 *  derived envelope keys into the very same `proposedKeys` an author's own keys sit in, so two edits
 *  that never named the same envelope key still read as if they had, the moment either side's write
 *  got paired onto a sole Segment or read back from one. Only `authoredEnvelopeKeys` — captured before
 *  `reconcileEnvelope` runs — tells the two apart. */
function authoredFieldsWrittenBy(
  edit: StoredEdit,
  authoredEnvelopeKeys: ReadonlySet<string>,
): ReadonlySet<string> {
  const fields = new Set(fieldsWrittenBy(edit));
  for (const field of ENVELOPE_FIELDS) fields.delete(field);
  for (const key of authoredEnvelopeKeys) fields.add(key);
  return fields;
}

function guardExtensionHookDoesNotOverwriteBody(
  proposed: StoredEdits,
  bodyAuthoredEnvelopeKeys: ReadonlyMap<EntryId, ReadonlySet<string>>,
  extenderEdits: StoredEdits,
  extenderAuthoredEnvelopeKeys: ReadonlyMap<EntryId, ReadonlySet<string>>,
): void {
  if (!isDevMode()) return;
  for (const [id, edit] of extenderEdits) {
    const bodyEdit = proposed.get(id);
    if (!bodyEdit) continue;
    const bodyFields = authoredFieldsWrittenBy(
      bodyEdit,
      bodyAuthoredEnvelopeKeys.get(id) ?? NO_ENVELOPE_KEYS,
    );
    const extenderFields = authoredFieldsWrittenBy(
      edit,
      extenderAuthoredEnvelopeKeys.get(id) ?? NO_ENVELOPE_KEYS,
    );
    for (const field of extenderFields) {
      if (bodyFields.has(field)) {
        throw new Error(
          `buildCommitChangeSet: the extension hook proposed field "${field}" on entry "${String(id)}", ` +
            'which the transaction body already proposed (I4)',
        );
      }
    }
  }
}

/** Reconciles a body author's and an extender author's *own* envelope writes against the Entry's
 *  pre-transaction state, once (#232) — the fallback's third part. Chaining (reconciling the
 *  extender's cascade against the post-body state) cannot surface a genuine disagreement here: it
 *  always judges the extender's write against an Entry that already agrees with the body, by
 *  construction. Reconciling a patch of each side's own authored values against the entry neither
 *  side has touched yet is what lets a body-authored `segments` and an extender-authored `start` that
 *  disagree throw `SegmentsOutOfSyncError('conflicting', ...)` instead of one silently overwriting
 *  the other's Segment. */
function reconcileSharedEnvelope(
  original: Entry,
  bodyEdit: StoredEdit,
  bodyAuthoredKeys: ReadonlySet<string>,
  extenderEdit: StoredEdit,
  extenderAuthoredKeys: ReadonlySet<string>,
): StoredEdit {
  const patch: Record<string, unknown> = {};
  const bodyBag = bodyEdit as Record<string, unknown>;
  const extenderBag = extenderEdit as Record<string, unknown>;
  for (const key of bodyAuthoredKeys) patch[key] = bodyBag[key];
  for (const key of extenderAuthoredKeys) patch[key] = extenderBag[key];
  return reconcileEnvelope(original, patch, SHARED_ENVELOPE_OPERATION).edit;
}

/** Merges the body's and the extender's edits, keyed by Entry, correcting the envelope once where
 *  both authored it (#232) — `mergeStoredEditsByEntry` alone is enough everywhere else, because only
 *  `start`/`end`/`segments` are ever silently re-derived by reconciliation. This is the one merge the
 *  commit path diffs, replacing the two separate diffs of `proposed` and `extenderEdits` that used to
 *  let one field reach the `ChangeSet` twice with two different `to` values (#232). */
function mergeBodyAndExtenderEdits(
  byId: ReadonlyMap<EntryId, Entry>,
  proposed: StoredEdits,
  bodyAuthoredEnvelopeKeys: ReadonlyMap<EntryId, ReadonlySet<string>>,
  extenderEdits: StoredEdits,
  extenderAuthoredEnvelopeKeys: ReadonlyMap<EntryId, ReadonlySet<string>>,
): StoredEdits {
  if (extenderEdits.size === 0) return proposed;
  const merged = new Map<EntryId, StoredEdit>(proposed);
  for (const [id, extenderEdit] of extenderEdits) {
    const bodyEdit = proposed.get(id);
    let combined = mergeStoredEdits(bodyEdit, extenderEdit);
    const bodyEnvelope = bodyAuthoredEnvelopeKeys.get(id) ?? NO_ENVELOPE_KEYS;
    const extenderEnvelope = extenderAuthoredEnvelopeKeys.get(id) ?? NO_ENVELOPE_KEYS;
    const original =
      bodyEdit !== undefined && bodyEnvelope.size > 0 && extenderEnvelope.size > 0 ? byId.get(id) : undefined;
    if (original !== undefined) {
      const reconciledEnvelope = reconcileSharedEnvelope(
        original,
        bodyEdit!,
        bodyEnvelope,
        extenderEdit,
        extenderEnvelope,
      );
      combined = { ...combined, ...reconciledEnvelope };
    }
    merged.set(id, combined);
  }
  return merged;
}

/**
 * Runs the five commit stages against staged store state and returns a folded `ChangeSet`, or
 * `undefined` when the net effect is empty (D-S2-24 step 6).
 *
 * A plugin-store row counts toward "empty" exactly as a Field row does (D-S5-24, #156). Collecting the
 * rows here, rather than only where entries are diffed, is what lets a transaction whose only write is
 * a plugin row still commit: it builds a changeset, so `runTransaction` does not return early, and the
 * ordinary commit emits `change`, records one undo step, and bumps `datasetRevision` once.
 */
export function buildCommitChangeSet(
  data: CommitChangeSetInput,
  origin: ChangeOrigin,
): ChangeSet | undefined {
  const byId = data.entries.committedById();
  const proposed = data.entries.pendingEdits();
  const bodyAuthoredEnvelopeKeys = data.entries.pendingAuthoredEnvelopeKeys();
  const addedEntities = data.entries.pendingAdded();
  const removedEntities = data.entries.pendingRemoved();
  const added = addedEntities.map((row) => row.entity);
  const removed = removedEntities.map((row) => row.entity);

  // The extender's cascade is reconciled against the state its own edit lands on — committed entries
  // overlaid with this transaction's body edits, plus the entries this transaction itself adds — not
  // against `byId` alone (#212 R2 fix-plan review, finding A). `byId` is pre-transaction: an entry the
  // body just added is absent from it, and an entry whose Segments the body just rewrote still shows
  // its old ones there, so reconciling against `byId` would restore the envelope against Segments the
  // commit is about to replace.
  const effectiveForExtender = buildEffectiveEntries(byId, added, removed, proposed);
  // The hook is judged against `effectiveForExtender` above, so it must be able to read that same
  // state, not just `byId` (D-S5-45) — `entryAfterEdits` is that map's own `.get`, already built for
  // reconciliation, so this costs nothing extra at commit. `extraEditsReadingFor`, not the public
  // `extraEditsFor`, because the guard and the merge below need the hook's authored envelope keys,
  // which the public method's return shape has no room for (#232).
  const extenderReading = data.extraEditsReadingFor({
    entries: byId,
    proposed,
    entryAfterEdits: (id) => effectiveForExtender.get(id),
  });
  const extenderEdits = reconcileExtenderEdits(effectiveForExtender, extenderReading.stored, () =>
    data.mintSegmentId(),
  );
  guardExtensionHookDoesNotOverwriteBody(
    proposed,
    bodyAuthoredEnvelopeKeys,
    extenderEdits,
    extenderReading.authoredEnvelopeKeys,
  );

  // One merge of the body's and the extender's edits, reconciled once against each entry's
  // pre-transaction state wherever both authored the envelope, and diffed once below (#232) — two
  // separate diffs of `proposed` and `extenderEdits` used to let one field reach the `ChangeSet`
  // twice, with two different `to` values, whenever a one-Segment entry's envelope carried both a
  // body-authored key and an extender-authored one.
  const mergedBodyAndExtender = mergeBodyAndExtenderEdits(
    byId,
    proposed,
    bodyAuthoredEnvelopeKeys,
    extenderEdits,
    extenderReading.authoredEnvelopeKeys,
  );
  const bodyAndExtenderUpdated = diffEdits(byId, mergedBodyAndExtender, data.fields, data.fieldContext);

  const hierarchyEdits = promoteNewParents(
    byId,
    { added, removed, edits: mergedBodyAndExtender },
    data.hierarchy,
  );
  const hierarchyUpdated = diffEdits(byId, hierarchyEdits, data.fields, data.fieldContext);

  // An added entity folds in its own extender cascade too, not only its hierarchy promotion — an
  // `EditExtender` that rewrites `segments` on an entity this same transaction adds must still land
  // on the entity the changeset publishes (#212 R2 fix-plan review, finding A): the earlier code here
  // overlaid `hierarchyEdits` alone, so a reconciled extender edit for a same-transaction add computed
  // a correct `StoredEdit` upstream but never reached the stored entity.
  const extraEditsForAdded = mergeStoredEditsByEntry(extenderEdits, hierarchyEdits);
  const addedEntitiesForFold =
    extraEditsForAdded.size === 0
      ? addedEntities
      : addedEntities.map((row) => {
          const extra = extraEditsForAdded.get(row.entity.id);
          return extra === undefined ? row : { ...row, entity: entryAfterEdit(row.entity, extra) };
        });

  const rollupUpdated = rollUpFields(
    byId,
    {
      added: addedEntitiesForFold.map((row) => row.entity),
      removed,
      edits: { body: proposed, merged: mergeStoredEditsByEntry(mergedBodyAndExtender, hierarchyEdits) },
    },
    data.fields,
    data.rollUpKinds,
    data.fieldContext,
  );

  // Removing an entry removes its plugin rows in the same changeset, so the removed ids go in here.
  const pluginRows = data.pluginStores.pendingRows(removed.map((entry) => entry.id));

  return foldChangeSet(data.nextChangeSetId(), origin, addedEntitiesForFold, removedEntities, [
    ...bodyAndExtenderUpdated,
    ...hierarchyUpdated,
    ...rollupUpdated,
    ...pluginRows,
  ]);
}
