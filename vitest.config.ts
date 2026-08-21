import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: ['**/node_modules/**', 'eslint/rules/**', 'eslint/rules/fixtures/**'],
  },
});
