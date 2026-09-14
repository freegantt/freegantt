// S2's span rollup (D-S2-22) was the first kind-dependent behaviour in data/, and this rule was its
// guard: a kind string literal compared against a `.kind` property in src/data/** or src/layout/**,
// where it must instead go through a lookup (a `Set`/registry), never an inline comparison.
//
// ADR 0013 later retired the field this rule was written for: an Entry carries no stored
// classification, so `entry.kind` no longer exists, and derivation and look follow structure and
// registered Variants instead (ADR 0018, ADR 0022). The rule stays registered as a general backstop
// against inline `.kind` dispatch on any object in these two layers, but its original target is gone.

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
        'ban comparing a kind string literal against a .kind property in data/ and layout/ (plans/01 §2.5, ADR 0013)',
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
