---
name: pk-rename-symbol
description: Rename a TypeScript symbol through the language service instead of grep — follows re-exports and aliases, skips prose and compound names.
argument-hint: '<file-that-declares-it> <OldName> <NewName>'
disable-model-invocation: true
---

# Rename a TypeScript symbol

A mass rename by `grep`/`sed` is a **text** edit. This is a **symbol** edit: [`rename-symbol.mjs`](rename-symbol.mjs) calls `ts.findRenameLocations`, the same call behind F2-rename in an editor and `textDocument/rename` over LSP.

Measured on this repo renaming `Entry`: grep found 1177 hits in 136 files, the language service found 495 in 89, in under a second. The difference was prose.

## Run it

From the project root, always dry-run first:

```bash
node .claude/skills/pk-rename-symbol/rename-symbol.mjs src/model/entry.ts Entry StoredEntry
node .claude/skills/pk-rename-symbol/rename-symbol.mjs src/model/entry.ts Entry StoredEntry --apply
pnpm typecheck
```

Name the file that **declares** the symbol, not a file that uses it. The script reads the project's own `tsconfig.json` and `typescript`, so every directory in `include` is covered in one pass.

## What it gets right, and grep does not

- Follows re-exports, barrel files, `paths` aliases, and `import { Old as Local }` — renaming the imported name and leaving the local alias alone.
- Skips `OldNameId`, `OldNameInput` and every other compound identifier.
- Skips comments, doc blocks, string literals and test titles. That is correct: a same-named word in prose is a separate editorial decision, so make it deliberately afterwards.
- Never touches Markdown. Specs, ADRs and plans stay manual — they often mean the old concept on purpose.

## The hazard it cannot see

A rename is safe. **Reusing the old name for a new type is not.** When `Old` becomes `NewName` and something else then takes the name `Old`, both types satisfy any position that reads shared members, so `pnpm typecheck` stays green while the meaning inverts.

Split that into two steps and prove the gap between them:

1. Rename, then confirm `grep -rn '\bOld\b' src/` returns zero.
2. Only then introduce the new declaration.
