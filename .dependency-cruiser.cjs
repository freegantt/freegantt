'use strict';

// Transcribes the layer diagram in plans/01-domain-architecture.md §1 literally.
// One forbidden rule per missing arrow (I1). Any import not drawn in that diagram fails the build.
// scripts/guard-red-test.mjs proves this file actually blocks violations (docs/04-hooks-and-ci.md §4).

const layer = (name) => `^src/${name}(/|$)`;

// Leaf-only widenings (plans/01-domain-architecture.md §1, "render/ --> data/dev-mode.ts" and
// "extensions/ --> data/dev-mode.ts"): names one file, not a whole layer — `pathNot` excludes it from
// the forbidden set below without opening a general edge to the rest of that layer. Every other file
// in `data/` stays unreachable from `render/`/`extensions/`.
const DEV_MODE_LEAF = '^src/data/dev-mode\\.ts$';

function forbid(name, from, allowedTargets, allowedLeaves = []) {
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
    comment: `plans/01 §1: src/${from} may only import ${allowedTargets.length ? allowedTargets.join(', ') : 'nothing in src/'}${allowedLeaves.length ? `, plus the named leaf(s): ${allowedLeaves.join(', ')}` : ''}.`,
    from: { path: layer(from) },
    to: allowedLeaves.length
      ? { path: others.map(layer), pathNot: allowedLeaves }
      : { path: others.map(layer) },
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
    // data/dev-mode.ts: S5.4 QC — render/dom/index.ts and extensions/plugin-runtime.ts each hand-
    // copied this one-line import.meta.env.DEV check because neither may reach data/ generally; this
    // names the single zero-dependency file both may import instead (plans/01 §1).
    forbid('render-boundary', 'render', ['layout'], [DEV_MODE_LEAF]),
    // model: Entry types flow through view as type-only params (same rationale as api, above).
    // extensions: S5.1, D-S5-5 — `view/gantt-shell.ts` constructs the `PluginRuntime` and hands it the
    // public `Gantt` façade; the arrow is view/ -> extensions/, never the reverse (see the
    // `extensions-public-only` rule below — extensions/ may not import view/ back).
    forbid('view-boundary', 'view', ['render', 'layout', 'data', 'model', 'extensions']),
    // model: Entry/EntryId/ItemId types flow through interaction/ as type-only params (S3, D-S3-4/
    // D-S3-5, plans/s3-direct-manipulation/README.md P3 — landed with S3.2). One arrow, nothing else:
    // interaction/ still may not reach time/, layout/ or render/ — every date/pixel computation a
    // gesture needs is a pure layout/ function the shell hands back through EntryGestureContext.
    forbid('interaction-boundary', 'interaction', ['view', 'data', 'model']),
    // S5.1, D-S5-5: the dogfood gate as a lint rule, not a review note — replaces the old placeholder
    // extensions-boundary rule (which allowed view/interaction and forbade api/model, backwards from
    // what this slice needs). `extensions/` (the plugin runtime plus every built-in feature) may see
    // only what a third-party plugin author can import — `api/` and `model/`. When a built-in cannot
    // do its job through that surface, the public API has a gap: close the gap, never widen this
    // rule. `scripts/guard-red-test.mjs` proves it actually blocks a violation.
    // data/dev-mode.ts is the one named exception (S5.4 QC, see render-boundary above): a zero-
    // dependency leaf, not a `data/` edge — every other file under `data/` stays unreachable here.
    {
      name: 'extensions-public-only',
      severity: 'error',
      comment:
        'plans/s5-extensibility-and-editing/s5.1-plugin-runtime.md D-S5-5: src/extensions may only ' +
        'import src/api and src/model, plus the named leaf src/data/dev-mode.ts.',
      from: { path: '^src/extensions' },
      to: { path: '^src/(?!extensions|api|model)', pathNot: DEV_MODE_LEAF },
    },
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
    // extensions: S5.1, D-S5-1/D-S5-5 — `api/plugin.ts` types `PluginContext.disposables` against
    // `extensions/disposables.ts`'s `DisposableStore` (a leaf with no further imports of its own, so
    // this one addition carries no risk of routing api/ through the DOM-touching parts of extensions/).
    forbid('api-boundary', 'api', ['view', 'data', 'model', 'time', 'layout', 'interaction', 'extensions']),
    // D-S2-23: the first of the four removable-leaf rules. Only `build-commit-change-set.ts` (commit
    // path) and `transaction.ts` (construction path) may import the Rollup — delete src/data/rollup.ts
    // and groups keep their authored values, the same result `rollUpKinds: 'none'` already gives a
    // consumer.
    removable(
      'rollup-is-removable',
      '^src/data/rollup\\.ts$',
      '^src/data/(build-commit-change-set|transaction)\\.ts$',
    ),
    // D-S4-17: delete src/data/hierarchy.ts and promotion never runs.
    removable(
      'autogroup-is-removable',
      '^src/data/hierarchy\\.ts$',
      '^src/data/(build-commit-change-set|transaction)\\.ts$',
    ),
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
