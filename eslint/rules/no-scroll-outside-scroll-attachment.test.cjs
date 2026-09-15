'use strict';

const { RuleTester } = require('eslint');
const rule = require('./no-scroll-outside-scroll-attachment.cjs');

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
});

ruleTester.run('no-scroll-outside-scroll-attachment', rule, {
  valid: [
    'const x = el.clientWidth;',
    'model.setScrollLeft(10);',
    { code: 'el.scrollLeft = 10;', filename: '/repo/src/view/scroll-attachment.ts' },
    { code: 'el.scrollTop = 10;', filename: '/repo/src/view/scroll-attachment.ts' },
  ],
  invalid: [
    { code: 'el.scrollLeft = 10;', errors: [{ messageId: 'scrollProp' }] },
    { code: 'el.scrollTo(0, 0);', errors: [{ messageId: 'scrollTo' }] },
    // Only the one exempt filename is exempt — anything else, including a plausible-looking
    // retired name, still reports.
    {
      code: 'el.scrollTop = 10;',
      filename: '/repo/src/view/scroll-axis.ts',
      errors: [{ messageId: 'scrollProp' }],
    },
  ],
});

console.log('no-scroll-outside-scroll-attachment: all cases passed.');
