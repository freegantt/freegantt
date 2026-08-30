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
    // model: Entry/EntryId/ItemId types flow through interaction/ as type-only params (S3, D-S3-4/
    // D-S3-5, plans/s3-direct-manipulation/README.md P3 — landed with S3.2). One arrow, nothing else:
    // interaction/ still may not reach time/, layout/ or render/ — every date/pixel computation a
    // gesture needs is a pure layout/ function the shell hands back through EntryGestureContext.
    forbid('interaction-boundary', 'interaction', ['view', 'data', 'model']),
    forbid('extensions-boundary', 'extensions', ['view', 'interaction']),
    // model and time are the type/primitive surface api/ re-exports (plans/01 §1: "api/ and model/
    // types are public", widened to time/'s public primitives and presets by #25, and to layout/'s
    // TimeScaleModel/ScrollModel by issue #91 §9-I — D9 names both as public, consumer-constructed
    // objects, so laundering them through view/ (which has no other interest in them) was the same
    // bug as #25's dayPreset, not a load-bearing hop).
    // interaction: S3 (plans/s3-direct-manipulation/README.md §0, "API --> INT arrow"). interaction/
    // controllers sit one layer above view/ (INT --> VIEW, not the reverse) — nothing inside view/
    // may import interaction/ to wire the default pointer-gesture attachments in, and extensions/
    // (the other layer that reaches both) does not exist until S5. api/gantt.ts is the composition
    // root that supplies `attachEntryGestures` to `GanttShell` by constructor injection (the shell
    // itself takes it structurally-typed, no import of its own — see gantt-shell.ts's
    // `AttachEntryGestures` comment), the same way it already wires view/, data/, model/, time/ and
    // layout/ together for a plain `new Gantt(...)`.
    forbid('api-boundary', 'api', ['view', 'data', 'model', 'time', 'layout', 'interaction']),
    // D-S2-23: the first of the four removable-leaf rules. Only data/transaction.ts's own step-5
    // call site may import the span rollup — delete src/data/span-rollup.ts and groups keep their
    // authored span, the same result `derivedSpanKinds: []` already gives a consumer.
    removable('span-rollup-is-removable', '^src/data/span-rollup\\.ts$', '^src/data/transaction\\.ts$'),
    // D-S2-23/D-S2-20: view/gantt-shell.ts's one call site, plus this file's own unit test — delete
    // src/view/dataset-change-subscription.ts and its one call site and the Gantt still constructs,
    // lays out, renders and scrolls; it just renders the data as it was at construction and never
    // updates again (the static-image floor).
    removable(
      'dataset-change-subscription-is-removable',
      '^src/view/dataset-change-subscription\\.ts$',
      '^src/view/(gantt-shell\\.ts|dataset-change-subscription\\.test\\.ts)$',
    ),
    // D-S2-23: delete src/data/history.ts and its one construction line in dataset-state.ts and the
    // commit path is unchanged, byte for byte — a Dataset just has no undo/redo
    // (plans/s2-data-core/s2.5-undo-redo.md §2.1). The property test lives in its own file
    // (history.property.test.ts), so both test files are named here.
    removable(
      'history-is-removable',
      '^src/data/history\\.ts$',
      '^src/data/(dataset-state\\.ts|history\\.(test|property\\.test)\\.ts)$',
    ),
    // D-S2-23: delete src/data/serialization/** and its two façade lines in api/dataset.ts and the
    // data core never learns a document format exists. The directory's own files (and its tests)
    // import each other; the property test [S2-A1] reads `toJSON` for the DatasetState extender run.
    removable(
      'serialization-is-removable',
      '^src/data/serialization/',
      '^src/(api/dataset\\.ts|data/serialization/.+|data/history\\.property\\.test\\.ts)$',
    ),
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
