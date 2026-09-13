// data/ — the four-stage commit pipeline (C1, ADR 0013 dropped the autoGroup promotion stage): body
// edits → extension hook → rollup → fold. The only module that imports `rollup.ts` on the commit path
// (`rollup-is-removable`).

import { entryId } from '../model/index.js';
import type {
  ChangeOrigin,
  ChangeSet,
  ChangeSetId,
  EntityAdded,
  EntityRemoved,
  StoredEntry,
  EntryId,
  FieldUpdated,
  HierarchySource,
  SegmentId,
  ProposedEdit,
  StoreRowUpdated,
} from '../model/index.js';
import { diffEdit, foldChangeSet } from './change-set.js';
import type { EditRequest, ProposedEdits } from './edit-extension.js';
import type { ErrorBus } from './error-reporting.js';
import {
  buildCascadeDroppedReport,
  buildDerivedValuesDroppedReport,
  raiseErrorOn,
} from './error-reporting.js';
import { reconcileEnvelope, reconcileExtenderEdits } from './entry-reader.js';
import type { EditsReading } from './entry-reader.js';
import { buildEffectiveEntries } from './entry-tree.js';
import {
  emptyProposedEdit,
  mergeProposedEdits,
  entryAfterEdit,
  proposedKeysOf,
  withProposedKeys,
} from './fields/field-access.js';
import type { FieldAccess } from './fields/field-access.js';
import type { FieldRegistry } from './fields/field-registry.js';
import { rollUpFields } from './rollup.js';
import type { ParentIndex } from './hierarchy-source.js';
import { isDevMode } from './dev-mode.js';

/** Staged entry-store state the commit pipeline reads — mirrors `TransactionalEntryStore` without
 *  importing `transaction.ts` (cycle avoidance). */
export interface CommitChangeSetEntryStore {
  committedById(): ReadonlyMap<EntryId, StoredEntry>;
  /** The committed rows' checked parents, memoized per revision — see `EntryStore.committedParents`. */
  committedParents(): ParentIndex;
  pendingAdded(): readonly EntityAdded[];
  pendingRemoved(): readonly EntityRemoved[];
  pendingEdits(): ProposedEdits;
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
  readonly fields: FieldRegistry;
  readonly fieldAccess: FieldAccess;
  /** The tree the Rollup walks (ADR 0020) — see `TransactionData.hierarchySource`. */
  readonly hierarchySource: HierarchySource;
  nextChangeSetId(): ChangeSetId;
  /** The commit path's real counter (ADR 0012): a plugin's cascade that turns a dateless Entry
   *  spanning for the first time always mints a real `SegmentId` here, because this path always
   *  reaches the store. `entry-reader.ts`'s `reconcileExtenderEdits` is the one caller. */
  mintSegmentId(): SegmentId;
  /** ADR 0013, decision 5/6: where this commit's own dropped-derived-value warnings go. Read here,
   *  not threaded back out through the return value, because a commit that folds to `undefined`
   *  (net-empty) still owes the warning — the drop already happened in the Rollup pass above it. */
  readonly bus: ErrorBus;
}

export function diffEdits(
  byId: ReadonlyMap<EntryId, StoredEntry>,
  edits: ProposedEdits,
  fields: FieldRegistry,
  access: FieldAccess,
): FieldUpdated[] {
  const updated: FieldUpdated[] = [];
  for (const [id, edit] of edits) updated.push(...diffEdit(byId, id, edit, fields, access));
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

/** Which Fields an edit writes. `proposedKeys` is required on every `ProposedEdit` (ADR 0011), so it
 *  always names the real Field — a declared `props` key by its own name, never the `props` container
 *  itself, which is bookkeeping on the edit, not a Field in its own right (#197). There is no more
 *  raw-key fallback: walking `Object.keys(edit)` would pick up `__brand`/`props`/`proposedKeys` as if
 *  they were Field names, which is exactly the bug this function existed to avoid. */
function fieldsWrittenBy(edit: ProposedEdit): ReadonlySet<string> {
  return proposedKeysOf(edit);
}

/** Which Fields an edit's *author* stated, for the I4 guard (#232). `fieldsWrittenBy` above answers
 *  that correctly for every Field except `start`/`end`/`segments`: `reconcileEnvelope` folds its own
 *  derived envelope keys into the very same `proposedKeys` an author's own keys sit in, so two edits
 *  that never named the same envelope key still read as if they had, the moment either side's write
 *  got paired onto a sole Segment or read back from one. Only `authoredEnvelopeKeys` — captured before
 *  `reconcileEnvelope` runs — tells the two apart. */
function authoredFieldsWrittenBy(
  edit: ProposedEdit,
  authoredEnvelopeKeys: ReadonlySet<string>,
): ReadonlySet<string> {
  const fields = new Set(fieldsWrittenBy(edit));
  for (const field of ENVELOPE_FIELDS) fields.delete(field);
  for (const key of authoredEnvelopeKeys) fields.add(key);
  return fields;
}

function guardExtensionHookDoesNotOverwriteBody(
  proposed: ProposedEdits,
  bodyAuthoredEnvelopeKeys: ReadonlyMap<EntryId, ReadonlySet<string>>,
  extenderEdits: ProposedEdits,
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
  original: StoredEntry,
  bodyEdit: ProposedEdit,
  bodyAuthoredKeys: ReadonlySet<string>,
  extenderEdit: ProposedEdit,
  extenderAuthoredKeys: ReadonlySet<string>,
): ProposedEdit {
  const patch: ProposedEdit = { ...emptyProposedEdit() };
  const bag = patch as Record<string, unknown>;
  const bodyBag = bodyEdit as Record<string, unknown>;
  const extenderBag = extenderEdit as Record<string, unknown>;
  for (const key of bodyAuthoredKeys) bag[key] = bodyBag[key];
  for (const key of extenderAuthoredKeys) bag[key] = extenderBag[key];
  const reconciled = reconcileEnvelope(original, patch, SHARED_ENVELOPE_OPERATION);
  // `patch` already carried `__brand`/`props`/`proposedKeys` before `reconcileEnvelope` ran, so
  // `addedKeys` never names them — only the caller's own authored keys and whatever
  // `reconcileEnvelope` newly derived (`segments` paired on, or `start`/`end` read back) belong in
  // the reconciled edit's own `proposedKeys` (ADR 0011: it is required now, so this states it,
  // rather than leaving it the empty set `emptyProposedEdit()` seeded).
  return withProposedKeys(reconciled.edit, [
    ...bodyAuthoredKeys,
    ...extenderAuthoredKeys,
    ...reconciled.addedKeys,
  ]);
}

/** Merges the body's and the extender's edits, keyed by Entry, correcting the envelope once where
 *  both authored it (#232) — `mergeProposedEditsByEntry` alone is enough everywhere else, because only
 *  `start`/`end`/`segments` are ever silently re-derived by reconciliation. This is the one merge the
 *  commit path diffs, replacing the two separate diffs of `proposed` and `extenderEdits` that used to
 *  let one field reach the `ChangeSet` twice with two different `to` values (#232). */
function mergeBodyAndExtenderEdits(
  byId: ReadonlyMap<EntryId, StoredEntry>,
  proposed: ProposedEdits,
  bodyAuthoredEnvelopeKeys: ReadonlyMap<EntryId, ReadonlySet<string>>,
  extenderEdits: ProposedEdits,
  extenderAuthoredEnvelopeKeys: ReadonlyMap<EntryId, ReadonlySet<string>>,
): ProposedEdits {
  if (extenderEdits.size === 0) return proposed;
  const merged = new Map<EntryId, ProposedEdit>(proposed);
  for (const [id, extenderEdit] of extenderEdits) {
    const bodyEdit = proposed.get(id);
    let combined = mergeProposedEdits(bodyEdit, extenderEdit);
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
      // Not a blind spread (ADR 0011, the two-shallow-spread trap): `reconciledEnvelope.props` is
      // always `{}` — `reconcileSharedEnvelope` only ever resolves `start`/`end`/`segments` — so
      // spreading it whole would wipe every declared key `combined` already carries. The envelope
      // keys it resolved win; `combined`'s own `props` and the union of both `proposedKeys` survive.
      combined = withProposedKeys(
        { ...combined, ...reconciledEnvelope, props: combined.props },
        new Set([...proposedKeysOf(combined), ...proposedKeysOf(reconciledEnvelope)]),
      );
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
    entryAfterEdits: (id) => effectiveForExtender.get(entryId(id)),
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
  const bodyAndExtenderUpdated = diffEdits(byId, mergedBodyAndExtender, data.fields, data.fieldAccess);

  // An added entity folds in its own extender cascade — an `EditExtender` that rewrites `segments`
  // on an entity this same transaction adds must still land on the entity the changeset publishes
  // (#212 R2 fix-plan review, finding A). There is no hierarchy-promotion cascade to fold in beside
  // it any more (ADR 0013): a parent is structural, so nothing writes a Field for gaining a child.
  const addedEntitiesForFold =
    extenderEdits.size === 0
      ? addedEntities
      : addedEntities.map((row) => {
          const extra = extenderEdits.get(row.entity.id);
          return extra === undefined ? row : { ...row, entity: entryAfterEdit(row.entity, extra) };
        });

  const { updated: rollupUpdated, cascadeDropped } = rollUpFields(
    byId,
    {
      added: addedEntitiesForFold.map((row) => row.entity),
      removed,
      edits: { body: proposed, merged: mergedBodyAndExtender },
    },
    data.fields,
    data.fieldAccess,
    () => data.mintSegmentId(),
    { committedParents: data.entries.committedParents(), source: data.hierarchySource },
  );

  // ADR 0013, decision 5: the extension hook proposed a rolling-up Field the Rollup owns, and the
  // Rollup overwrote it anyway. One report for the whole commit, never one per row.
  if (cascadeDropped.length > 0) {
    raiseErrorOn(data.bus, buildCascadeDroppedReport(cascadeDropped));
  }

  // ADR 0013, decision 6: an entity `entries.add()` just created was already a parent by the time
  // this commit landed (a batch of `add()` calls in one transaction), and one of its rolling-up
  // Fields had nothing to roll up to. Reparenting an *existing* entity onto a new parent is not this
  // — that recompute stays silent (decision 6) — so only the ids this commit itself added qualify.
  const addedIds = new Set(addedEntitiesForFold.map((row) => row.entity.id));
  const addDropped = rollupUpdated.filter((row) => row.to === undefined && addedIds.has(row.id));
  if (addDropped.length > 0) {
    raiseErrorOn(data.bus, buildDerivedValuesDroppedReport(addDropped));
  }

  // Removing an entry removes its plugin rows in the same changeset, so the removed ids go in here.
  const pluginRows = data.pluginStores.pendingRows(removed.map((entry) => entry.id));

  return foldChangeSet(data.nextChangeSetId(), origin, addedEntitiesForFold, removedEntities, [
    ...bodyAndExtenderUpdated,
    ...rollupUpdated,
    ...pluginRows,
  ]);
}
