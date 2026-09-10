import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  {
    test: {
      name: 'type-probes',
      environment: 'node',
      include: ['plans/field-redesign/combined/spikes/type-probes/**/*.test.ts'],
    },
  },
]);
