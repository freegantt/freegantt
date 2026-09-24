// data/ — undo/redo (plans/s2-data-core/s2.5-undo-redo.md). A subscriber to `change`, not a step in the
// commit path: `data/transaction.ts` imports nothing from this file, and `history-is-removable`
// (`.dependency-cruiser.cjs`, D-S2-23) allows exactly one importer, `data/dataset-state.ts`, which
// constructs it. Delete this file and its one construction line and the commit path is unchanged, byte
// for byte. Recording goes through `on('change')` alone, and `undo`/`redo` replay through
// `replayChangeSet` (`replay.ts`) — the same primitive `Dataset.replay` publishes — so this file is
// fully reproducible from the public surface (`plans/s2-data-core/s2b-undo-replay-seam.md`). It imports
// nothing from `transaction.ts` directly.

import type { ChangeSet, DatasetEventMap } from '../model/index.js';
import { invertChangeSet } from './change-set.js';
import { replayChangeSet } from './replay.js';
import type { TransactionData } from './replay.js';

export interface HistoryOptions {
  /** How many undoable transactions the stack keeps. Oldest drops first once full (D-S2-13). */
  capacity?: number;
}

const DEFAULT_CAPACITY = 100;

/** Undo and redo over a Dataset's committed changesets (§2 of the step file). A stack plus a cursor:
 *  everything below the cursor is undoable, everything at or above it (up to the stack's own top) is
 *  redoable. Recording, capacity, and the cursor all live here — the commit path knows none of it. */
export class History {
  readonly #data: TransactionData;
  readonly #capacity: number;
  #stack: ChangeSet[] = [];
  #cursor = 0;
  // Set for the span of this History's own `replayChangeSet` call, so `#onChange` can tell its own
  // `undo()`/`redo()` apart from an outside `dataset.replay()` landing on the same 'undo'/'redo'
  // origin — the public door docs/05-consumer-api.md's "Advanced" section invites a consumer to call
  // directly. An outside replay moves no cursor and touches no stack slot; only this History's own
  // call does.
  #replayingOwnStep = false;
  // Set for the span of `#unwindOnThrow`'s `attempt`, so `#forgetStep` can record what it removed and
  // `#unwindOnThrow` can put it back if `attempt` throws. `undefined` outside that span. `satBelowCursor`
  // is whether the cursor moved down for this forget, so the restore moves it back up in step.
  #forgottenThisAttempt: Array<{ index: number; step: ChangeSet; satBelowCursor: boolean }> | undefined =
    undefined;

  constructor(data: TransactionData, options: HistoryOptions = {}) {
    this.#data = data;
    this.#capacity = options.capacity ?? DEFAULT_CAPACITY;
    data.bus.on('change', this.#onChange);
  }

  get canUndo(): boolean {
    return this.#cursor > 0;
  }

  get canRedo(): boolean {
    return this.#cursor < this.#stack.length;
  }

  /** Replays the step at the cursor inverted (`to`→`from`, `added`↔`removed`) with `origin: 'undo'`.
   *  A no-op when `canUndo` is `false`. Neither re-runs the extension hook nor the Rollup on its
   *  own — `replayChangeSet` decides what a sync since this step's recording has already settled,
   *  and writes only what is left (`changesToReplay`, #517 amendment). A step with nothing left to
   *  write is forgotten, and the loop tries the one below it, so one click always lands a step when
   *  any undoable one remains. A refused undo (a `beforeChange` handler returning `false`) throws
   *  `MutationCancelledError` and leaves the stack exactly where it was — the cursor moves on the
   *  `change` that commit emits (D-S2-25), so a veto never reaches `#onChange`; and a step the loop
   *  forgot on the way there un-forgets, so a veto really does leave history untouched, not just the
   *  cursor (`#unwindOnThrow`). */
  undo(): void {
    this.#unwindOnThrow(() => {
      while (this.canUndo) {
        const index = this.#cursor - 1;
        const cursorBefore = this.#cursor;
        this.#replayOwnStep(invertChangeSet(this.#stack[index]!));
        if (this.#cursor !== cursorBefore) return; // the write landed; #onChange already moved the cursor
        this.#forgetStep(index); // nothing was left to write — try the step below it
      }
    });
  }

  /** Re-applies the step just above the cursor exactly as recorded, with `origin: 'redo'`. A no-op
   *  when `canRedo` is `false`. Forgets a step with nothing left to write and tries the one above it,
   *  the same way `undo` does, and un-forgets on a throw the same way too. */
  redo(): void {
    this.#unwindOnThrow(() => {
      while (this.canRedo) {
        const index = this.#cursor;
        const cursorBefore = this.#cursor;
        this.#replayOwnStep({ ...this.#stack[index]!, origin: 'redo' });
        if (this.#cursor !== cursorBefore) return;
        this.#forgetStep(index);
      }
    });
  }

  /** Runs `attempt`, which may call `#forgetStep` one or more times before either landing a write or
   *  throwing (a vetoed `beforeChange`, or an aggregator failure). A landed write keeps every forgotten
   *  step forgotten — they really had nothing left to write. A throw restores them in the order they
   *  were removed, so the documented "a refused undo/redo leaves history exactly where it was" holds
   *  even when the loop had already forgotten a moot step or two on the way to the one that threw. */
  #unwindOnThrow(attempt: () => void): void {
    const outer = this.#forgottenThisAttempt;
    const forgotten: Array<{ index: number; step: ChangeSet; satBelowCursor: boolean }> = [];
    this.#forgottenThisAttempt = forgotten;
    try {
      attempt();
    } catch (error) {
      for (const { index, step, satBelowCursor } of forgotten.reverse()) {
        this.#stack.splice(index, 0, step);
        if (satBelowCursor) this.#cursor += 1;
      }
      throw error;
    } finally {
      this.#forgottenThisAttempt = outer;
    }
  }

  /** Marks the coming `replayChangeSet` call as this History's own, so `#onChange` moves the cursor
   *  and rewrites the stack slot for it — and only for it. */
  #replayOwnStep(changeSet: ChangeSet): void {
    this.#replayingOwnStep = true;
    try {
      replayChangeSet(this.#data, changeSet);
    } finally {
      this.#replayingOwnStep = false;
    }
  }

  /** The whole coupling to the rest of `data/` — an exhaustive switch, so a future origin (#419)
   *  forces a choice here at compile time. `'user'` records a new stack entry. `'sync'` (#517) does
   *  not: a write the user did not make records no step and erases no Redo, the same rule #419's own
   *  write door reuses. `'undo'` and `'redo'` move the cursor (D-S2-25) and replace the stack entry
   *  with what they actually wrote — `invertChangeSet` of it for `'undo'`, as recorded for `'redo'` —
   *  so a later undo or redo inverts what really landed, not the step as first recorded; undo then
   *  redo is neutral even across a sync in between (§2g). An `'undo'`- or `'redo'`-origin write this
   *  History did not itself call `replayChangeSet` for — an outside `dataset.replay()` — moves no
   *  cursor and writes no stack slot (`#replayingOwnStep`); otherwise it would move the cursor off a
   *  step that is not this History's, or past either end of the stack. This handler is the first
   *  `change` subscriber, so a later handler (the harness undo button included) already reads the
   *  post-move `canUndo`/`canRedo`. `'load'` (#496) empties the stack instead: `entries.load()` is a new
   *  baseline, not an undoable step, so `canUndo`/`canRedo` both read `false` right after it — the
   *  same posture a desktop app takes opening a file. */
  #onChange = ({ changeSet }: DatasetEventMap['change']): void => {
    switch (changeSet.origin) {
      case 'user':
        this.#record(changeSet);
        break;
      case 'sync':
        break;
      case 'undo':
        // An outside `dataset.replay({ origin: 'undo' })` did not come from this History's own
        // `undo()` — ignore it rather than moving the cursor off a step that is not this History's,
        // or off the bottom of an empty stack.
        if (!this.#replayingOwnStep) break;
        this.#cursor -= 1;
        this.#stack[this.#cursor] = invertChangeSet(changeSet);
        break;
      case 'redo':
        // Same rule as 'undo': an outside `dataset.replay({ origin: 'redo' })` is ignored, so it
        // can never append a phantom stack entry past the real top.
        if (!this.#replayingOwnStep) break;
        this.#stack[this.#cursor] = changeSet;
        this.#cursor += 1;
        break;
      case 'load':
        this.clear();
        break;
      default: {
        const unhandled: never = changeSet.origin;
        throw new Error(`History: no rule for origin "${String(unhandled)}"`);
      }
    }
  };

  /** A step whose replay wrote nothing (`undo`/`redo`'s own loop, #517): splice it out of the stack,
   *  and move the cursor down when the forgotten step sat below it. `undo`/`redo` then try the next
   *  step in the same click — the stack always shrinks by one here, so the loop always ends. Recorded
   *  on `#forgottenThisAttempt` first, when set, so `#unwindOnThrow` can put it back. */
  #forgetStep(index: number): void {
    const satBelowCursor = index < this.#cursor;
    this.#forgottenThisAttempt?.push({ index, step: this.#stack[index]!, satBelowCursor });
    this.#stack.splice(index, 1);
    if (satBelowCursor) this.#cursor -= 1;
  }

  /** Empties the stack and moves the cursor back to it — `entries.load()`'s own arm (#496): a full
   *  fresh start owes no undo step, and nothing above the new baseline is redoable either.
   *
   *  Public so `DatasetState.clearHistory()` can call it once every plugin's `data()` has run (ADR
   *  0031): a plugin's setup writes record here like any other commit, and this is what makes
   *  `canUndo` read `false` right after `new Dataset()` — a setup seed is not an undo step (#137). */
  clear(): void {
    this.#stack.length = 0;
    this.#cursor = 0;
  }

  /** A new user edit while the cursor sits below the top clears everything above it (§2.2) — that is
   *  what truncating to the cursor before pushing does. At capacity the oldest entry drops; the cursor
   *  always ends at the new top, so `canUndo` reads true for every entry the stack still holds. */
  #record(changeSet: ChangeSet): void {
    this.#stack.length = this.#cursor;
    this.#stack.push(changeSet);
    if (this.#stack.length > this.#capacity) this.#stack.shift();
    this.#cursor = this.#stack.length;
  }
}
