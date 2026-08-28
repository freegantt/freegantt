// CLAUDE.md entry-kinds rule: "Entry.kind is authored, never derived from having children.
// Behavior per kind goes through the seams ... no `if (kind === ...)` chains outside them." S2's
// span rollup (D-S2-22) is the first kind-dependent behaviour in data/, and this is its guard: a
// kind string literal compared against a `.kind` property in src/data/** or src/layout/**, where it
// must instead go through a lookup (a `Set`/registry), never an inline comparison.

'use strict';

function isKindMember(node) {
  return (
    node.type === 'MemberExpression' && node.property.type === 'Identifier' && node.property.name === 'kind'
  );
}

function isStringLiteral(node) {
  return node.type === 'Literal' && typeof node.value === 'string';
}

// CLAUDE.md's own carve-out is `entry.kind ?? 'span'` — reading the stored default, not branching on
// behavior. Comparing against that same default to decide whether a value equals its default (and so
// can be omitted, e.g. from a serialized document) is the same carve-out under a different operator:
// it's a shape/omission decision, not the "different behavior per kind" chain the rule targets. A
// comparison against any other kind value still trips the rule.
const DEFAULT_KIND = 'span';

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'ban comparing a kind string literal against Entry.kind in data/ and layout/ (CLAUDE.md, plans/01 §2.5)',
    },
    messages: {
      kindLiteral:
        'kind is dispatched through a lookup, never compared inline. Register behavior at the seam for this layer. (plans/01 §2.5)',
    },
    schema: [],
  },
  create(context) {
    return {
      'BinaryExpression[operator=/^(===|!==|==|!=)$/]'(node) {
        const kindSide = isKindMember(node.left) ? node.left : isKindMember(node.right) ? node.right : null;
        const literalSide = kindSide === node.left ? node.right : node.left;
        if (kindSide === null) return;
        if (!isStringLiteral(literalSide)) return;
        if (literalSide.value === DEFAULT_KIND) return;
        context.report({ node, messageId: 'kindLiteral' });
      },
      SwitchStatement(node) {
        if (!isKindMember(node.discriminant)) return;
        for (const kase of node.cases) {
          if (kase.test && isStringLiteral(kase.test)) {
            context.report({ node: kase, messageId: 'kindLiteral' });
          }
        }
      },
    };
  },
};
