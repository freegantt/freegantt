// data/ — one home for the Vite/dev-mode flag (C15). `model/` stays types-only.

export function isDevMode(): boolean {
  return (import.meta as { env?: { DEV?: boolean } }).env?.DEV ?? false;
}
