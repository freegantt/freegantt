'use strict';

// Transcribes the layer diagram in plans/01-domain-architecture.md §1 literally.
// One forbidden rule per missing arrow (I1). Any import not drawn in that diagram fails the build.
// scripts/guard-red-test.mjs proves this file actually blocks violations (docs/04-hooks-and-ci.md §4).

const layer = (name) => `^src/${name}(/|$)`;

function forbid(name, from, allowedTargets) {
  const others = [
    'model',
    'time',
    'data',
    'scheduling',
    'layout',
    'render',
    'view',
    'interaction',
    'extensions',
    'api',
  ].filter((l) => l !== from && !allowedTargets.includes(l));

  return {
    name,
    severity: 'error',
    comment: `plans/01 §1: src/${from} may only import ${allowedTargets.length ? allowedTargets.join(', ') : 'nothing in src/'}.`,
    from: { path: layer(from) },
    to: { path: others.map(layer) },
  };
}

// A "leaf" module (D-S2-23): exactly one file may import it, so deleting it is provably a
// degradation, not a break — dependency-cruiser is what proves the claim, not just the prose that
// makes it. Red-test fixtures for these land with the rest of the removable-leaf set in S2.7.
function removable(name, modulePath, allowedImporterPath) {
  return {
    name,
    severity: 'error',
    comment: `D-S2-23: ${modulePath} is a leaf — only ${allowedImporterPath} may import it.`,
    from: { path: '^src/', pathNot: allowedImporterPath },
    to: { path: modulePath },
  };
}

module.exports = {
  forbidden: [
    forbid('model-is-leaf', 'model', []),
    forbid('time-boundary', 'time', ['model']),
    forbid('layout-boundary', 'layout', ['time', 'model']),
    forbid('scheduling-boundary', 'scheduling', ['time', 'model']),
    // No 'scheduling' target: data/ has no static dependency on scheduling/ at all — they meet only
    // through the generic resolve hook, decided once at setup (plans/01 §1, issue #12).
    // time: D-S2-1 (plans/s2-data-core/README.md) — serialization (Instant<->ISO, time/instant.ts's
    // toISO) and mutation-time input reading (time/input.ts's toInstant/toEndInstant) both need it.
    forbid('data-boundary', 'data', ['time', 'model']),
    forbid('render-boundary', 'render', ['layout']),
    // model: Entry types flow through view as type-only params (same rationale as api, above).
    forbid('view-boundary', 'view', ['render', 'layout', 'data', 'model']),
    forbid('interaction-boundary', 'interaction', ['view', 'data']),
    forbid('extensions-boundary', 'extensions', ['view', 'interaction']),
    // model and time are the type/primitive surface api/ re-exports (plans/01 §1: "api/ and model/
    // types are public", widened to time/'s public primitives and presets by #25).
    forbid('api-boundary', 'api', ['view', 'data', 'model', 'time']),
    // D-S2-23: the first of the four removable-leaf rules. Only data/transaction.ts's own step-5
    // call site may import the span rollup — delete src/data/span-rollup.ts and groups keep their
    // authored span, the same result `derivedSpanKinds: []` already gives a consumer.
    removable('span-rollup-is-removable', '^src/data/span-rollup\\.ts$', '^src/data/transaction\\.ts$'),
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Circular imports are never valid in a strictly layered architecture.',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      extensions: ['.ts', '.js'],
    },
  },
};
