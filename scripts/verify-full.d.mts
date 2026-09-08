// Type surface for verify-full.mjs's exports, consumed by test/guards/verify-covers-ci.test.ts. The
// script itself stays plain JS (run directly by `node`, no build step) — this is the sibling
// declaration file convention for a `.mjs` module (Node ESM), not a signal it should become
// TypeScript.

/** The shape this gate needs from package.json: a script name to command-line map. */
export interface PackageScripts {
  scripts?: Record<string, string>;
}

export function readCheckList(pkg: PackageScripts): string[];
