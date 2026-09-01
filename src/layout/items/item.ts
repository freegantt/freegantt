// layout/ — the Item a Kind's emitter produces (D-S4-24). Types only; the registry lives next door.

import type { Entry, EntryId, EntryKind, Instant, ItemId } from '../../model/index.js';

export interface Item {
  id: ItemId;
  entryId: EntryId;
  kind: EntryKind;
  label: string;
  start: Instant;
  end: Instant;
}

export interface ItemEmissionContext {
  entryById: ReadonlyMap<EntryId, Entry>;
}

export type ItemEmitter = (entry: Entry, ctx: ItemEmissionContext) => readonly Item[];
