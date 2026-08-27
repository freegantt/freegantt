// data/ — DatasetState: the live state one Dataset instance owns privately (D-S2-2, OQ5). `api/Dataset`
// is a thin façade that constructs one of these and delegates `entries`/`timeZone`/`dateOnlyEnd` to it —
// the same structural/façade relationship `GanttShell` already has with `Gantt`.

import type { DateOnlyEndRule, Dataset, Entry, EntryInput, Instant } from '../model/index.js';
import { now } from '../time/index.js';
import { EntryStore } from './entry-store.js';
import { readEntries } from './entry-reader.js';

export interface DatasetStateOptions {
  entries: readonly EntryInput[];
  timeZone: string;
  dateOnlyEnd?: DateOnlyEndRule;
}

export class DatasetState implements Dataset {
  readonly entries: EntryStore;
  readonly timeZone: string;
  readonly dateOnlyEnd: DateOnlyEndRule;
  /** The one `Date.now()` read this Dataset performs, via time/'s `now()` (CONTEXT.md, Reference
   *  date). Fixed for the Dataset's lifetime — not re-derived on every layout pass. Used to
   *  initialize a derived-span-kind entry's zero-length span before the S2.2 rollup gives it a
   *  real one. */
  readonly referenceDate: Instant;

  constructor(options: DatasetStateOptions) {
    this.timeZone = options.timeZone;
    this.dateOnlyEnd = options.dateOnlyEnd ?? 'inclusive';
    this.referenceDate = now();
    const entries: readonly Entry[] = readEntries(options.entries, {
      timeZone: this.timeZone,
      dateOnlyEnd: this.dateOnlyEnd,
    });
    this.entries = new EntryStore(entries);
  }
}
