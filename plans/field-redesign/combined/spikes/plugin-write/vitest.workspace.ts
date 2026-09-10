import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  {
    test: {
      name: 'plugin-write',
      environment: 'node',
      include: ['plans/field-redesign/combined/spikes/plugin-write/**/*.test.ts'],
    },
  },
]);
