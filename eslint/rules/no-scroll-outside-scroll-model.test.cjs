'use strict';

const { RuleTester } = require('eslint');
const rule = require('./no-scroll-outside-scroll-model.cjs');

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
});

ruleTester.run('no-scroll-outside-scroll-model', rule, {
  valid: ['const x = el.clientWidth;', 'model.setScrollLeft(10);'],
  invalid: [
    { code: 'el.scrollLeft = 10;', errors: [{ messageId: 'scrollProp' }] },
    { code: 'el.scrollTo(0, 0);', errors: [{ messageId: 'scrollTo' }] },
  ],
});

console.log('no-scroll-outside-scroll-model: all cases passed.');
