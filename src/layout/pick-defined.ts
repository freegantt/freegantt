// layout/ — a shared, zero-dependency helper. `api/` and `view/` both build a
// spread-in-only-if-defined options bag under `exactOptionalPropertyTypes`; `view/` may not import
// `api/` (view-boundary, plans/01 §1), so this is the one layer both can reach.

/** Call: `pickDefined(options, ['scroll', 'preset'])` — keys whose value is `undefined` are
 *  dropped, not carried through as an explicit `undefined` property. */
export function pickDefined<T extends object, K extends keyof T>(
  options: T,
  keys: readonly K[],
): Partial<Pick<T, K>> {
  const picked: Partial<Pick<T, K>> = {};
  for (const key of keys) {
    const value = options[key];
    if (value !== undefined) picked[key] = value;
  }
  return picked;
}
