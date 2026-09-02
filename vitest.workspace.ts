import { defineWorkspace } from 'vitest/config';

// `pure` runs in Node with no DOM env at all — proving D4/pure-layer claims by construction.
// `dom` runs happy-dom for the modules that legitimately touch the DOM.
export default defineWorkspace([
  {
    extends: './vitest.config.ts',
    test: {
      name: 'pure',
      environment: 'node',
      setupFiles: ['test/setup/assert-no-dom.ts'],
      include: [
        'src/model/**/*.test.ts',
        'src/time/**/*.test.ts',
        'src/layout/**/*.test.ts',
        'src/scheduling/**/*.test.ts',
        'src/data/**/*.test.ts',
        'src/render/null/**/*.test.ts',
        'test/pure/**/*.test.ts',
        'fixtures/**/*.test.ts',
      ],
    },
  },
  {
    extends: './vitest.config.ts',
    test: {
      name: 'dom',
      environment: 'happy-dom',
      include: [
        'src/render/dom/**/*.test.ts',
        'src/view/**/*.test.ts',
        'src/interaction/**/*.test.ts',
        'src/extensions/**/*.test.ts',
        'src/api/**/*.test.ts',
        'test/dom/**/*.test.ts',
      ],
    },
  },
  {
    extends: './vitest.config.ts',
    test: {
      name: 'guards',
      environment: 'node',
      include: ['test/guards/**/*.test.ts'],
    },
  },
]);
