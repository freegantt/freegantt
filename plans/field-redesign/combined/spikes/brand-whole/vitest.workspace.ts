import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  {
    test: {
      name: 'brand-whole',
      environment: 'node',
      include: ['plans/field-redesign/combined/spikes/brand-whole/**/*.test.ts'],
    },
  },
]);
