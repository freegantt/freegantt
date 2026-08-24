'use strict';

const { RuleTester } = require('eslint');
const rule = require('./no-scroll-outside-scroll-model.cjs');

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
});

ruleTester.run('no-scroll-outside-scroll-model', rule, {
  valid: [
    'const x = el.clientWidth;',
    'model.setScrollLeft(10);',
    { code: 'el.scrollLeft = 10;', filename: '/repo/src/view/scroll-attachment.ts' },
    { code: 'el.scrollTop = 10;', filename: '/repo/src/view/scroll-attachment.ts' },
  ],
  invalid: [
    { code: 'el.scrollLeft = 10;', errors: [{ messageId: 'scrollProp' }] },
    { code: 'el.scrollTo(0, 0);', errors: [{ messageId: 'scrollTo' }] },
    // The old exemption path is retargeted (S1.5) — a file at the pre-S1.5 name is no longer exempt.
    {
      code: 'el.scrollTop = 10;',
      filename: '/repo/src/view/scroll-model.ts',
      errors: [{ messageId: 'scrollProp' }],
    },
  ],
});

console.log('no-scroll-outside-scroll-model: all cases passed.');
