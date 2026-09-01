// B9 (docs/02 §2, plans/01 §8, plans/s2-data-core/s2.6-serialization.md §1.4): serialization
// persists authored fields only. A Row/Item/GeometryFrame type reference or a layout/view import
// here would be derived data leaking into JSON. Scoped to `src/data/serialization/**` in
// eslint.config.js.

'use strict';

const DERIVED_TYPES = new Set(['Row', 'Item', 'GeometryFrame']);
const BANNED_IMPORT = /[/\\](layout|view)([/\\]|$)/;

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'ban Row/Item/GeometryFrame type references and layout/view imports in serialization (B9)',
    },
    messages: {
      derivedType:
        'B9: derived types (Row/Item/GeometryFrame) never appear in serialization — only authored fields persist.',
      derivedImport: 'B9: serialization may not import layout/ or view/ — derived data never persists.',
    },
    schema: [],
  },
  create(context) {
    return {
      TSTypeReference(node) {
        if (node.typeName.type !== 'Identifier') return;
        if (DERIVED_TYPES.has(node.typeName.name)) {
          context.report({ node, messageId: 'derivedType' });
        }
      },
      ImportDeclaration(node) {
        const source = node.source.value;
        if (typeof source !== 'string') return;
        if (BANNED_IMPORT.test(source)) {
          context.report({ node, messageId: 'derivedImport' });
        }
      },
    };
  },
};
