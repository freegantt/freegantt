'use strict';

const { RuleTester } = require('eslint');
const parser = require('@typescript-eslint/parser');
const rule = require('./model-is-types-only.cjs');

const ruleTester = new RuleTester({
  languageOptions: { parser, ecmaVersion: 2022, sourceType: 'module' },
});

ruleTester.run('model-is-types-only', rule, {
  valid: [
    'export type EntryId = string & { readonly __brand: "EntryId" };',
    'export function entryId(value: string): EntryId { return value as EntryId; }',
    'import type { Entry } from "./entry.js";',
    'import { type Entry } from "./entry.js";',
    {
      code: 'export class FreeGanttError extends Error {}',
      filename: '/repo/src/model/errors.ts',
    },
  ],
  invalid: [
    { code: 'export const registry = new Map();', errors: [{ messageId: 'valueDeclaration' }] },
    { code: 'export class Thing {}', errors: [{ messageId: 'valueDeclaration' }] },
    { code: 'export function helper() { return 1 + 1; }', errors: [{ messageId: 'valueDeclaration' }] },
    { code: 'import { thing } from "./other.js";', errors: [{ messageId: 'valueImport' }] },
    {
      code: 'export class NotAnErrorFile {}',
      filename: '/repo/src/model/entry.ts',
      errors: [{ messageId: 'valueDeclaration' }],
    },
  ],
});

console.log('model-is-types-only: all cases passed.');
