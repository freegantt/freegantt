// layout/ owns row geometry (plans/01 §4, D-C). `computeFrame` needs O(log n) "top of row i" and "row
// at offset y" for virtualization even under S4's pack-mode variable heights, so the index sits behind
// an interface from S1 rather than being inlined as an array walk. `PrefixSumHeightIndex` is the S1
// implementation; an O(log n) structure replaces it in S6 only if the measured spike says so (D2).

export interface RowHeightIndex {
  heightAt(index: number): number;
  topAt(index: number): number;
  indexAtY(y: number): number;
  readonly totalHeight: number;
  invalidateFrom(index: number): void;
}

/** Prefix sums computed lazily and cached; `invalidateFrom` discards the cached suffix so the next
 * read recomputes only what changed instead of the whole index. */
export class PrefixSumHeightIndex implements RowHeightIndex {
  readonly #count: number;
  readonly #getHeight: (index: number) => number;
  readonly #tops: number[];
  #validUpTo: number;

  constructor(count: number, getHeight: (index: number) => number) {
    this.#count = count;
    this.#getHeight = getHeight;
    this.#tops = new Array<number>(count + 1).fill(0);
    this.#validUpTo = 0;
  }

  #ensure(uptoIndex: number): void {
    for (let i = this.#validUpTo; i < uptoIndex; i++) {
      this.#tops[i + 1] = this.#tops[i]! + this.#getHeight(i);
    }
    if (uptoIndex > this.#validUpTo) this.#validUpTo = uptoIndex;
  }

  heightAt(index: number): number {
    return this.#getHeight(index);
  }

  topAt(index: number): number {
    this.#ensure(index);
    return this.#tops[index]!;
  }

  get totalHeight(): number {
    this.#ensure(this.#count);
    return this.#tops[this.#count]!;
  }

  indexAtY(y: number): number {
    if (this.#count === 0 || y <= 0) return 0;
    this.#ensure(this.#count);
    let lo = 0;
    let hi = this.#count - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.#tops[mid]! <= y) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  invalidateFrom(index: number): void {
    const clamped = Math.max(0, index);
    if (clamped < this.#validUpTo) this.#validUpTo = clamped;
  }
}
