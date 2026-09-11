// plans/01 §1, docs/02 §3.7: model/ is types only — zero runtime beyond the id/brand helper
// allowlist, zero dependencies. Every value-producing declaration outside that allowlist, and every
// non-type import, is a boundary break.

'use strict';

const IDENTITY_CAST_HELPERS = new Set([
  'brand',
  'unbrand',
  'entryId',
  'dependencyId',
  'rowId',
  'itemId',
  'itemIdFromDataset',
  'rowIdFromDataset',
  'entryIdFromDataset',
  'segmentIdFromDataset',
  'changeSetId',
  'segmentId',
  'mintedSegmentId',
]);

/** Readers of an ItemId (D-S4-25). They parse; they are not identity casts. */
const ITEM_ID_READERS = new Set(['entryIdOfItem', 'segmentIndexOfItem']);

/** The span invariant's one home (ADR 0012, Q5 in plans/field-redesign/BUILD-LOG.md). The author
 * widened the carve-out for it on 2026-09-11: one pure predicate over the two dates, with no state
 * and no dependency. It answers a question about a type this file declares, so it lives beside it. */
const SPAN_PREDICATE = new Set(['spansTime']);

function isAllowedHelperName(name) {
  return IDENTITY_CAST_HELPERS.has(name) || ITEM_ID_READERS.has(name) || SPAN_PREDICATE.has(name);
}

function isInsideAllowedHelper(node) {
  let current = node.parent;
  while (current) {
    if (current.type === 'FunctionDeclaration') {
      const name = current.id?.name;
      return Boolean(name && isAllowedHelperName(name));
    }
    current = current.parent;
  }
  return false;
}

function isSingleReturnBody(node) {
  // `export function entryId(value: string): EntryId { return value as EntryId; }` — one return
  // statement and nothing else. Every helper this file admits states its whole answer in one
  // expression; a body with steps in it is logic, and logic does not belong in model/.
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
        if (name && IDENTITY_CAST_HELPERS.has(name) && isSingleReturnBody(node)) return;
        if (name && ITEM_ID_READERS.has(name)) return;
        if (name && SPAN_PREDICATE.has(name) && isSingleReturnBody(node)) return;
        context.report({ node, messageId: 'valueDeclaration' });
      },
      ClassDeclaration(node) {
        if (isErrorsFile) return;
        context.report({ node, messageId: 'valueDeclaration' });
      },
      'VariableDeclaration > VariableDeclarator'(node) {
        if (node.init === null) return; // ambient `declare const x: T` has no runtime value
        if (isInsideAllowedHelper(node)) return;
        context.report({ node, messageId: 'valueDeclaration' });
      },
    };
  },
};
