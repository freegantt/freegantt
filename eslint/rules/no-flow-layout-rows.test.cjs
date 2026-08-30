'use strict';

const { RuleTester } = require('eslint');
const rule = require('./no-flow-layout-rows.cjs');

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
});

ruleTester.run('no-flow-layout-rows', rule, {
  valid: [
    // Outside the scoped directories, flow-layout reads are not this rule's concern.
    { code: 'const h = el.offsetHeight;', filename: '/repo/src/layout/frame.ts' },
    { code: 'const h = el.clientHeight;', filename: '/repo/src/api/gantt.ts' },
    { code: 'el.getBoundingClientRect();', filename: '/repo/src/interaction/drag.ts' },
    // Row height comes from frame.rows, not measurement.
    {
      code: 'node.style.height = `${row.height}px`;',
      filename: '/repo/src/render/dom/index.ts',
    },
    // Named exemptions: pane-box measurement is a different concept from row height.
    { code: 'const w = host.clientWidth;', filename: '/repo/src/view/pane-layout.ts' },
    { code: 'const h = host.clientHeight;', filename: '/repo/src/view/pane-layout.ts' },
    { code: 'const h = host.clientHeight;', filename: '/repo/src/view/pane-size-attachment.ts' },
    {
      code: 'const x = pane.getBoundingClientRect().left;',
      filename: '/repo/src/view/wheel-navigation.ts',
    },
  ],
  invalid: [
    {
      code: 'const h = row.offsetHeight;',
      filename: '/repo/src/view/gantt-shell.ts',
      errors: [{ messageId: 'flowLayoutProp' }],
    },
    {
      code: 'const h = row.clientHeight;',
      filename: '/repo/src/render/dom/index.ts',
      errors: [{ messageId: 'flowLayoutProp' }],
    },
    {
      code: 'const rect = row.getBoundingClientRect();',
      filename: '/repo/src/view/pane-layout-helper.ts',
      errors: [{ messageId: 'flowLayoutRect' }],
    },
  ],
});

console.log('no-flow-layout-rows: all cases passed.');
