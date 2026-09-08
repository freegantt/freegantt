import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      // Same alias as `vite.config.ts` and `tsconfig.json`'s own "paths" entry — see that file's
      // comment. A test that installs a harness plugin (#153: `[S5-A3]` installs `bufferKind()`)
      // reaches the library the way a consumer does, through the bare `freegantt` specifier.
      // Without this alias Node's package self-reference answers that specifier from `dist/`, so
      // the test would exercise the last build and would not resolve at all before the first one.
      // CI runs `test:dom` before `build` (`.github/workflows/ci.yml`), so `dist/` is absent there.
      freegantt: fileURLToPath(new URL('./src/api/index.ts', import.meta.url)),
    },
  },
  test: {
    exclude: ['**/node_modules/**', 'eslint/rules/**', 'eslint/rules/fixtures/**'],
  },
});
