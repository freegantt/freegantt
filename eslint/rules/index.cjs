'use strict';

module.exports = {
  rules: {
    'no-magic-time-constants': require('./no-magic-time-constants.cjs'),
    'no-date-outside-time': require('./no-date-outside-time.cjs'),
    'no-scroll-outside-scroll-attachment': require('./no-scroll-outside-scroll-attachment.cjs'),
    'no-instant-arithmetic': require('./no-instant-arithmetic.cjs'),
    'no-time-to-pixel-math': require('./no-time-to-pixel-math.cjs'),
    'no-flow-layout-rows': require('./no-flow-layout-rows.cjs'),
    'no-inline-style-outside-geometry': require('./no-inline-style-outside-geometry.cjs'),
    'no-module-level-state': require('./no-module-level-state.cjs'),
    'model-is-types-only': require('./model-is-types-only.cjs'),
    'no-store-mutation-outside-transaction': require('./no-store-mutation-outside-transaction.cjs'),
    'require-invariant-header': require('./require-invariant-header.cjs'),
    'no-kind-literal': require('./no-kind-literal.cjs'),
    'no-derived-in-json': require('./no-derived-in-json.cjs'),
    'editable-has-one-reader': require('./editable-has-one-reader.cjs'),
  },
};
