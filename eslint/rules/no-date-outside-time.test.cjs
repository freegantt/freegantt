'use strict';

const { RuleTester } = require('eslint');
const rule = require('./no-date-outside-time.cjs');

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
});

ruleTester.run('no-date-outside-time', rule, {
  valid: ['instant(value);', 'const d = someOtherFactory();'],
  invalid: [
    { code: 'const d = new Date();', errors: [{ messageId: 'dateConstruct' }] },
    { code: 'const t = Date.now();', errors: [{ messageId: 'dateNow' }] },
  ],
});

console.log('no-date-outside-time: all cases passed.');
