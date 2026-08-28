'use strict';

const { RuleTester } = require('eslint');
const parser = require('@typescript-eslint/parser');
const rule = require('./no-module-level-state.cjs');

const ruleTester = new RuleTester({
  languageOptions: { parser, ecmaVersion: 2022, sourceType: 'module' },
});

ruleTester.run('no-module-level-state', rule, {
  valid: [
    'export const PRESETS = Object.freeze({ hour: 1, day: 2 });',
    'const SNAP = 14;',
    'export type X = { a: number };',
    'export function make() { return new Map(); }',
    'class Store { #cache = new Map(); }',
    "const TUPLE = ['a', 'b'] as const;",
  ],
  invalid: [
    { code: 'let cache = new Map();', errors: [{ messageId: 'letOrVar' }] },
    { code: 'export const registry = new Map();', errors: [{ messageId: 'mutableInit' }] },
    { code: 'const presets = { hour: 1 };', errors: [{ messageId: 'mutableInit' }] },
    {
      code: 'export const registry = Object.freeze(new Map());\nfunction add() { registry.set("a", 1); }',
      errors: [{ messageId: 'mutatedExport' }],
    },
  ],
});

console.log('no-module-level-state: all cases passed.');
