'use strict';

const { RuleTester } = require('eslint');
const rule = require('./no-inline-style-outside-geometry.cjs');

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
});

ruleTester.run('no-inline-style-outside-geometry', rule, {
  valid: [
    // Outside the scoped directories, inline styles are not this rule's concern.
    { code: "node.style.display = 'flex';", filename: '/repo/src/layout/frame.ts' },
    { code: "node.style.overflow = 'hidden';", filename: '/repo/src/api/gantt.ts' },
    // The three allowed properties: live per-frame/per-instance geometry.
    { code: 'node.style.transform = `translateY(${top}px)`;', filename: '/repo/src/render/dom/index.ts' },
    { code: 'node.style.width = `${w}px`;', filename: '/repo/src/view/pane-layout.ts' },
    { code: 'node.style.height = `${h}px`;', filename: '/repo/src/render/dom/index.ts' },
    // Not a style write at all.
    { code: "node.className = 'fg-row';", filename: '/repo/src/render/dom/index.ts' },
  ],
  invalid: [
    // The red fixture D-S1.10-6 fixes: pane-layout.ts's structural writes.
    {
      code: "gridPane.style.display = 'flex';",
      filename: '/repo/src/view/pane-layout.ts',
      errors: [{ messageId: 'structuralInlineStyle' }],
    },
    {
      code: "rowClip.style.overflow = 'hidden';",
      filename: '/repo/src/view/pane-layout.ts',
      errors: [{ messageId: 'structuralInlineStyle' }],
    },
    {
      code: "tick.style.position = 'absolute';",
      filename: '/repo/src/render/dom/index.ts',
      errors: [{ messageId: 'structuralInlineStyle' }],
    },
  ],
});

console.log('no-inline-style-outside-geometry: all cases passed.');
