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

module.exports = {
  forbidden: [
    forbid('model-is-leaf', 'model', []),
    forbid('time-boundary', 'time', ['model']),
    forbid('layout-boundary', 'layout', ['time', 'model']),
    forbid('scheduling-boundary', 'scheduling', ['time', 'model']),
    forbid('data-boundary', 'data', ['scheduling', 'model']),
    forbid('render-boundary', 'render', ['layout']),
    // model: Task/Dependency types flow through view as type-only params (same rationale as api, above).
    forbid('view-boundary', 'view', ['render', 'layout', 'data', 'model']),
    forbid('interaction-boundary', 'interaction', ['view', 'data']),
    forbid('extensions-boundary', 'extensions', ['view', 'interaction']),
    // model is the type surface api/ re-exports (plans/01 §1: "api/ and model/ types are public").
    forbid('api-boundary', 'api', ['view', 'data', 'model']),
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
