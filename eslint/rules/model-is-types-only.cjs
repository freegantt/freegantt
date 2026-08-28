// plans/01 §1, docs/02 §3.7: model/ is types only — zero runtime beyond the id/brand helper
// allowlist, zero dependencies. Every value-producing declaration outside that allowlist, and every
// non-type import, is a boundary break.

'use strict';

const ALLOWED_HELPERS = new Set([
  'brand',
  'unbrand',
  'entryId',
  'dependencyId',
  'rowId',
  'itemId',
  'changeSetId',
]);

function isOneLineIdentityCast(node) {
  // `export function entryId(value: string): EntryId { return value as EntryId; }` — single
  // return statement, no other statements, whose argument is the parameter cast to a type.
  if (node.body.type !== 'BlockStatement' || node.body.body.length !== 1) return false;
  const statement = node.body.body[0];
  return statement.type === 'ReturnStatement';
}

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'model/ is types only: zero runtime beyond id/brand helpers, zero dependencies (plans/01 §1)',
    },
    messages: {
      valueDeclaration:
        'model/ is types only: zero runtime beyond id/brand helpers, zero dependencies. (plans/01 §1)',
      valueImport:
        'model/ is types only: zero runtime beyond id/brand helpers, zero dependencies. (plans/01 §1)',
    },
    schema: [],
  },
  create(context) {
    // CLAUDE.md's model/ carve-out is "id/brand helpers and the FreeGanttError base class" —
    // errors.ts is the one file that widens the allowlist to error classes (plans/01 §1.1, D-S1.7-8).
    const isErrorsFile = context.filename.endsWith('errors.ts');

    return {
      ImportDeclaration(node) {
        if (node.importKind === 'type') return;
        if (node.specifiers.every((s) => s.importKind === 'type')) return;
        context.report({ node, messageId: 'valueImport' });
      },
      FunctionDeclaration(node) {
        const name = node.id?.name;
        if (name && ALLOWED_HELPERS.has(name) && isOneLineIdentityCast(node)) return;
        context.report({ node, messageId: 'valueDeclaration' });
      },
      ClassDeclaration(node) {
        if (isErrorsFile) return;
        context.report({ node, messageId: 'valueDeclaration' });
      },
      'VariableDeclaration > VariableDeclarator'(node) {
        if (node.init === null) return; // ambient `declare const x: T` has no runtime value
        context.report({ node, messageId: 'valueDeclaration' });
      },
    };
  },
};
