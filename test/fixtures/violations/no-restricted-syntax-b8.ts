// Must trigger: B8 no-not-implemented
export function stub(): never {
  throw new Error('not implemented');
}
