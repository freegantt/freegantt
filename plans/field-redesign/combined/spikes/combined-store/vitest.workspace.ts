import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  {
    test: {
      name: 'combined-store',
      environment: 'node',
      include: ['plans/field-redesign/combined/spikes/combined-store/**/*.test.ts'],
    },
  },
]);
