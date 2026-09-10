import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  {
    test: {
      name: 'update-flat',
      environment: 'node',
      include: ['plans/field-redesign/combined/spikes/update-flat/**/*.test.ts'],
    },
  },
]);
