// I9 (plans/01 §4, §11): grid and timeline rows both position from `frame.rows`, never from a
// flow-layout measurement of their own. Scoped to `src/view/**` and `src/render/dom/**` (S1.8,
// D-S1.8-8 — the issue's original scope, `src/view/grid/**`/`src/view/timeline/**`, never existed).
//
// Exempt: `pane-layout.ts` and `pane-size-attachment.ts`, both of which legitimately read
// `clientWidth`/`clientHeight` to measure the *pane's own box* — a different concept from *row*
// height (CONTEXT.md's "Pane size" vs "Row"). Banning that would break the synchronous first
// measurement `PaneLayout.measureTimelinePane()` already needs.
//
// Syntactic, not type-aware (docs/01 §I9 is AUTO-PARTIAL, mirroring I12's own shape): this rule
// bans reading `offsetHeight`/`clientHeight` and calling `getBoundingClientRect()`. It does not
// catch an assignment to `style.height` sourced from something other than `frame.rows[i].height` —
// too fragile to express syntactically. That residue is named in docs/02 §3.10, not hidden.

'use strict';

const BANNED_PROPS = new Set(['offsetHeight', 'clientHeight']);
const SCOPE = /[/\\]src[/\\](view|render[/\\]dom)[/\\]/;
const EXEMPT = /[/\\](pane-layout|pane-size-attachment)\.ts$/;

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'ban flow-layout row-height measurement in pane code (plans/01 §4, invariant I9, partial)',
    },
    messages: {
      flowLayoutProp:
        'Both panes position rows absolutely from frame.rows. Neither measures nor computes a height. (plans/01 §4, I9)',
      flowLayoutRect:
        'Both panes position rows absolutely from frame.rows. Neither measures nor computes a height. (plans/01 §4, I9)',
    },
    schema: [],
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();
    if (!SCOPE.test(filename) || EXEMPT.test(filename)) return {};

    return {
      MemberExpression(node) {
        if (node.property.type !== 'Identifier') return;
        if (BANNED_PROPS.has(node.property.name)) {
          context.report({ node, messageId: 'flowLayoutProp' });
        }
      },
      'CallExpression[callee.type="MemberExpression"]'(node) {
        const prop = node.callee.property;
        if (prop.type === 'Identifier' && prop.name === 'getBoundingClientRect') {
          context.report({ node, messageId: 'flowLayoutRect' });
        }
      },
    };
  },
};
