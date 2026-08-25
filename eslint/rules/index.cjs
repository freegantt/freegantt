'use strict';

module.exports = {
  rules: {
    'no-magic-time-constants': require('./no-magic-time-constants.cjs'),
    'no-date-outside-time': require('./no-date-outside-time.cjs'),
    'no-scroll-outside-scroll-model': require('./no-scroll-outside-scroll-model.cjs'),
    'no-instant-arithmetic': require('./no-instant-arithmetic.cjs'),
    'no-time-to-pixel-math': require('./no-time-to-pixel-math.cjs'),
    'no-flow-layout-rows': require('./no-flow-layout-rows.cjs'),
  },
};
