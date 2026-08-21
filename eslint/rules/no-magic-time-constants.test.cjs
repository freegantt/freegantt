'use strict';

const { RuleTester } = require('eslint');
const rule = require('./no-magic-time-constants.cjs');

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
});

ruleTester.run('no-magic-time-constants', rule, {
  valid: ['const x = 1234;', 'const dayMs = 24 * 60 * 60 * 1000; // computed, not a banned literal itself'],
  invalid: [
    { code: 'const day = 86400000;', errors: [{ messageId: 'magicTime' }] },
    { code: 'const hour = 3600000;', errors: [{ messageId: 'magicTime' }] },
  ],
});

console.log('no-magic-time-constants: all cases passed.');
