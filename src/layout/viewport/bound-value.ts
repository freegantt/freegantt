// layout/viewport — the D-S1.5-4 notification contract, in one place (plans/01 §8.2 D-A):
//
//   `bind` always notifies the newcomer. Every other notification fires iff the resolved value
//   actually changed.
//
// A BoundValue is one shareable viewport model's whole binding side: the bindings themselves, the
// value resolved from them, and the reaction each bound Gantt supplied. It keeps exactly ONE
// `Map<Binding, onChange>` — binding membership and change notification stay the same collection,
// which is what D-A requires — and it is scoped to `layout/viewport/`'s models on purpose. It is not
// a general notify primitive and must not grow into one: when a shareable model needs more than
// "call my reaction when I might be stale", that is still the signal to consolidate under `data/`'s
// reactivity façade (D-A), not to widen this.
//
// `TimeScaleModel` and `ScrollModel` differ only in what they resolve and in what counts as a
// change, so that is exactly what each one supplies here.

import { BatchedNotifier } from './batched-notifier.js';

export interface BoundValueContract<Binding, Value> {
  /** Resolves the shared value from every current binding. Called whenever the value is stale. */
  resolve: (bindings: Iterable<Binding>) => Value;
  /** What "the resolved value actually changed" means for this value (D-S1.5-4). */
  equals: (a: Value, b: Value) => boolean;
}

/** What `bind` hands back. Each model wraps it in its own handle, adding the setters that push
 * re-measured geometry (`setPaneWidth`, `setContentSize`, `setPaneSize`) — conventions §4. */
export interface BoundValueHandle {
  unbind(): void;
}

export class BoundValue<Binding, Value> {
  readonly #contract: BoundValueContract<Binding, Value>;
  /** One collection for both jobs: iterate the keys to resolve, the values to notify. */
  readonly #bindings = new Map<Binding, () => void>();
  readonly #notifications: BatchedNotifier;
  #resolved: Value | undefined;
  /** The value every bound reaction was last notified about — what "changed" is measured against.
   * Boxed so that "nothing has been notified yet" is distinct from every possible `Value`. */
  #notified: { value: Value } | undefined;

  constructor(contract: BoundValueContract<Binding, Value>) {
    this.#contract = contract;
    this.#notifications = new BatchedNotifier(() => this.#notifyIfChanged());
  }

  /** Memoized until the next `invalidate()`; the same object comes back until then, so a caller can
   * memoize its own derived value (a `TimeScale`, say) on this identity. */
  get resolved(): Value {
    this.#resolved ??= this.#contract.resolve(this.#bindings.keys());
    return this.#resolved;
  }

  /** The binding is the model's own copy of what the caller supplied (copy-at-bind: a caller holding
   * a reference must not be able to change the model's inputs behind its back). It is also the key
   * the returned handle closes over, so `unbind` removes this binding and no other.
   *
   * The newcomer always hears about its own bind — that IS its first render — even when the resolved
   * value did not move. Every other bound reaction hears about it iff it did. This does not wait for
   * an open batch: a first render is what the newcomer is here for. */
  bind(binding: Binding, onChange: () => void): BoundValueHandle {
    this.#bindings.set(binding, onChange);
    this.#resolved = undefined;
    const changed = this.#recordResolved();
    onChange();
    if (changed) {
      for (const [other, otherOnChange] of this.#bindings) {
        if (other !== binding) otherOnChange();
      }
    }
    return {
      unbind: () => {
        // A departing binding is never notified of its own departure; the rest are, iff the value
        // moved without it.
        if (this.#bindings.delete(binding)) this.invalidate();
      },
    };
  }

  /** An input changed: drop the memo and notify (now, or at the end of the open batch) iff the
   * value that comes back is different. */
  invalidate(): void {
    this.#resolved = undefined;
    this.#notifications.notify();
  }

  /** Several writes, at most one notification (CONTEXT.md, Batch). */
  batch(run: () => void): void {
    this.#notifications.batch(run);
  }

  #notifyIfChanged(): void {
    if (!this.#recordResolved()) return;
    for (const onChange of this.#bindings.values()) onChange();
  }

  #recordResolved(): boolean {
    const next = this.resolved;
    const changed = !this.#notified || !this.#contract.equals(this.#notified.value, next);
    this.#notified = { value: next };
    return changed;
  }
}
