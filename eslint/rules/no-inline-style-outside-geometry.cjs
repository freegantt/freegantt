// `plans/s1.10-theming-and-a11y/README.md` §3.3: once the base stylesheet ships,
// inline `node.style.<prop>` writes in `src/render/**`/`src/view/**` are legitimate for exactly the
// properties that carry per-frame or per-instance live numbers — `transform`, `width`, `height`.
// Everything else (display, overflow, position, cursor, background, …) is structure, and structure
// belongs in the shipped stylesheet (`src/view/styles.ts`), not scattered across DOM-writing files.
//
// Lands first, red fixture included, per `plans/04` §3.2/§3.3's "guardrail before the code it guards".
// Scope is `src/render/**` + `src/view/**` — the only directories writing inline styles today; it is
// expected to widen to `src/interaction/**` once gesture previews need the same per-frame allowance.

'use strict';

const ALLOWED_PROPS = new Set(['transform', 'width', 'height']);
const SCOPE = /[/\\]src[/\\](render|view)[/\\]/;

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'ban inline node.style.<prop> writes outside transform/width/height in render/view (plans/01 §8, S1.10)',
    },
    messages: {
      structuralInlineStyle:
        'Structure moves to the base stylesheet; inline styles are for live per-frame/per-instance ' +
        'geometry only ({{allowed}}). ({{prop}} is not one of them.) (plans/s1.10-theming-and-a11y/README.md D-S1.10-6)',
    },
    schema: [],
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();
    if (!SCOPE.test(filename)) return {};

    return {
      // node.style.foo = ... — MemberExpression `node.style.foo`, assigned to.
      'AssignmentExpression > MemberExpression.left'(node) {
        if (node.property.type !== 'Identifier') return;
        const prop = node.property.name;
        if (ALLOWED_PROPS.has(prop)) return;
        const object = node.object;
        if (
          object.type === 'MemberExpression' &&
          object.property.type === 'Identifier' &&
          object.property.name === 'style'
        ) {
          context.report({
            node,
            messageId: 'structuralInlineStyle',
            data: { prop, allowed: [...ALLOWED_PROPS].join('/') },
          });
        }
      },
    };
  },
};
