// #261: `plans/02` §4 was once the only published home of the Customization ladder, and by the time
// S5 audited it, it had been wrong for three slices with every gate green the whole time — twelve
// live tokens missing, a stale colour palette, a wrong published default, a selector that matched
// nothing. #221 question 1 moved the level-1 token reference to `docs/05-consumer-api.md` and
// corrected it once (`46db903`). This guard is the part that stops the drift happening a second time:
// it parses `src/view/styles.ts` for every `--fg-*` token the sheet actually carries, and fails when
// that set (or a documented default) disagrees with `docs/05-consumer-api.md`'s tables.
//
// A handful of documented tokens carry no CSS at all — `--fg-row-height`, `--fg-grid-pane-width` and
// five more are read once, in TypeScript, through `pixel-property.ts`, and the sheet never mentions
// them (CLAUDE.md's stop-rule names `--fg-grid-pane-width` as exactly this case, #157). This guard
// checks those seven against the TypeScript file that actually owns their fallback, named per token
// below, rather than skipping them — that file is the one place their real default can drift from
// the doc without this stylesheet ever changing.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel: string): string => fs.readFileSync(path.join(root, rel), 'utf8');

const styles = read('src/view/styles.ts');
const doc = read('docs/05-consumer-api.md');

// ---------------------------------------------------------------------------------------------
// Parsing src/view/styles.ts
// ---------------------------------------------------------------------------------------------

/** Pulls one `const NAME = \`...\`.trim[End]();` template literal's own text out of the sheet. */
function extractTemplate(constName: string): string {
  const re = new RegExp(`const ${constName} = \`([\\s\\S]*?)\`\\.(?:trimEnd|trim)\\(\\);`);
  const match = re.exec(styles);
  if (!match) throw new Error(`theming-contract guard: could not find "${constName}" in styles.ts`);
  return match[1]!;
}

/** Every `--fg-x: value;` declaration in a block of CSS text — a real property assignment, never a
 *  `var(--fg-x, default)` read (that pattern never puts a colon right after the token name). Scoped
 *  to one line so a prose comment naming a token in passing (`--fg-selection-color's own...`) can
 *  never be mistaken for a declaration that happens to run into a `;` several lines later. */
function declarationsIn(block: string): Map<string, string> {
  const re = /(--fg-[\w-]+):\s*([^\n;]+);/g;
  const found = new Map<string, string>();
  let match: RegExpExecArray | null;
  while ((match = re.exec(block))) found.set(match[1]!, match[2]!.trim());
  return found;
}

/** Every `var(--fg-x, default)` fallback in a block of CSS text — the default a token resolves to
 *  when nothing sets it. This is how most structural/pixel tokens carry their default: not a bare
 *  declaration, but the second argument everywhere the sheet reads them back. */
function varFallbacksIn(block: string): Map<string, string> {
  const re = /var\((--fg-[\w-]+),\s*([^)]+)\)/g;
  const found = new Map<string, string>();
  let match: RegExpExecArray | null;
  while ((match = re.exec(block))) found.set(match[1]!, match[2]!.trim());
  return found;
}

const lightDeclared = declarationsIn(extractTemplate('LIGHT_COLOR_TOKENS'));
const darkDeclared = declarationsIn(extractTemplate('DARK_COLOR_TOKENS'));
const baseBlock = extractTemplate('BASE_STYLESHEET');
const baseDeclared = declarationsIn(baseBlock);
const baseVarFallback = varFallbacksIn(baseBlock);

/** Every `--fg-*` token the sheet defines anywhere — declared with a value, or read with a fallback
 *  default. Either shape is a real definition: `--fg-band-height` never gets a bare declaration, its
 *  only "default" is the `24px` in `var(--fg-band-height, 24px)`, and the doc already documents it
 *  that way. */
const sheetDefinedTokens = new Set<string>([
  ...lightDeclared.keys(),
  ...darkDeclared.keys(),
  ...baseDeclared.keys(),
  ...baseVarFallback.keys(),
]);

// ---------------------------------------------------------------------------------------------
// Tokens with no CSS presence at all — their real default lives in a TypeScript file, not the
// sheet (CLAUDE.md's stop-rule names `--fg-grid-pane-width` as this exact case, #157). Each entry
// names the file and the exact source line pattern that carries the number, so a future change to
// that constant flows through this guard without anyone having to remember to update it here.
// ---------------------------------------------------------------------------------------------

interface ExternalDefault {
  file: string;
  pattern: RegExp;
  unit: 'px';
}

const EXTERNAL_PIXEL_TOKENS: Record<string, ExternalDefault> = {
  '--fg-row-height': {
    file: 'src/view/frame-settings.ts',
    pattern: /export const DEFAULT_ROW_HEIGHT = (\d+(?:\.\d+)?);/,
    unit: 'px',
  },
  '--fg-grid-pane-width': {
    file: 'src/view/pane-layout.ts',
    pattern: /GRID_PANE_WIDTH_POLICY = \{ fallback: (\d+(?:\.\d+)?),/,
    unit: 'px',
  },
  '--fg-splitter-width': {
    file: 'src/view/pane-layout.ts',
    pattern: /SPLITTER_WIDTH_POLICY = \{ fallback: (\d+(?:\.\d+)?),/,
    unit: 'px',
  },
  '--fg-bar-min-width': {
    file: 'src/layout/frame.ts',
    pattern: /export const DEFAULT_MIN_BAR_WIDTH_PX = (\d+(?:\.\d+)?);/,
    unit: 'px',
  },
  '--fg-bar-height': {
    file: 'src/layout/frame.ts',
    pattern: /export const DEFAULT_BAR_HEIGHT_PX = (\d+(?:\.\d+)?);/,
    unit: 'px',
  },
  '--fg-column-width': {
    file: 'src/view/grid-columns.ts',
    pattern: /export const DEFAULT_COLUMN_WIDTH_PX = (\d+(?:\.\d+)?);/,
    unit: 'px',
  },
  '--fg-column-min-width': {
    file: 'src/view/column-chrome.ts',
    pattern: /DEFAULT_MIN_COLUMN_WIDTH = (\d+(?:\.\d+)?);/,
    unit: 'px',
  },
};

/** Tokens whose sheet-side default is a template interpolation (`${SOME_CONSTANT}px`), not a
 *  literal — the value the guard must check is the constant's own source, named here, the same
 *  import `styles.ts` itself uses. */
const INTERPOLATED_PIXEL_TOKENS: Record<string, ExternalDefault> = {
  '--fg-tick-box-floor': {
    file: 'src/layout/frame.ts',
    pattern: /export const DEFAULT_TICK_BOX_FLOOR_PX = (\d+(?:\.\d+)?);/,
    unit: 'px',
  },
  '--fg-bar-label-gap': {
    file: 'src/render/dom/dom-contract.ts',
    pattern: /export const DEFAULT_BAR_LABEL_GAP_PX = (\d+(?:\.\d+)?);/,
    unit: 'px',
  },
};

function resolveExternalDefault(token: string, def: ExternalDefault): string {
  const source = read(def.file);
  const match = def.pattern.exec(source);
  if (!match) {
    throw new Error(
      `theming-contract guard: expected to find ${token}'s default in ${def.file} matching ${def.pattern}, but did not — the guard's own source reference is stale`,
    );
  }
  return `${match[1]}${def.unit}`;
}

/** A structural/pixel token's real default, resolved from wherever it actually lives — the sheet's
 *  own literal fallback, a TypeScript constant the sheet interpolates, or (for the seven tokens with
 *  no CSS presence at all) the TypeScript file that owns it outright. */
function resolvePixelTokenDefault(token: string): string {
  if (token in EXTERNAL_PIXEL_TOKENS) return resolveExternalDefault(token, EXTERNAL_PIXEL_TOKENS[token]!);
  if (token in INTERPOLATED_PIXEL_TOKENS)
    return resolveExternalDefault(token, INTERPOLATED_PIXEL_TOKENS[token]!);
  const literal = baseVarFallback.get(token);
  if (literal === undefined) {
    throw new Error(`theming-contract guard: no known default source for ${token}`);
  }
  return literal;
}

// ---------------------------------------------------------------------------------------------
// Parsing docs/05-consumer-api.md
// ---------------------------------------------------------------------------------------------

/** The text between one `### Heading` and the next heading matching `stop` (exclusive on both
 *  ends) — scopes a table's own rows away from every other section in the file. */
function section(heading: string, stop: RegExp): string {
  const start = doc.indexOf(heading);
  if (start === -1)
    throw new Error(`theming-contract guard: heading "${heading}" not found in docs/05-consumer-api.md`);
  const rest = doc.slice(start + heading.length);
  const end = stop.exec(rest);
  return end ? rest.slice(0, end.index) : rest;
}

/** Every Markdown table row naming a `--fg-*` token in its first cell. Only the first two cells
 *  (token, default) are ever read back — a "Read by" prose cell may itself contain a stray `|`
 *  inside inline code, which would otherwise misdivide a naive split. */
function tokenRows(sectionText: string): { token: string; cells: string[] }[] {
  return sectionText
    .split('\n')
    .filter((line) => /^\|\s*`--fg-/.test(line))
    .map((line) => {
      const cells = line
        .split('|')
        .map((cell) => cell.trim())
        .filter((_, i, arr) => i > 0 && i < arr.length - 1);
      const token = cells[0]!.replace(/`/g, '');
      return { token, cells: cells.map((c) => c.replace(/^`|`$/g, '')) };
    });
}

const structuralSection = section('### Structural and pixel tokens', /^### /m);
const colourSection = section('### Colour and shadow tokens', /^### /m);
const internalSection = section('### Internal tokens', /^### /m);
const retiredSection = section('### Retired and renamed tokens', /^## /m);

const structuralRows = tokenRows(structuralSection);
const colourRows = tokenRows(colourSection);
const internalRows = tokenRows(internalSection);
/** Retired tokens are named in prose, one bullet per token, each opening `- **\`--fg-x\`**` — the
 *  bold name is the retired token itself. A plain name scan would also catch a bullet's own
 *  migration note naming the *replacement* token (`--fg-header-height`'s bullet mentions
 *  `--fg-band-height` as what a consumer migrates to), which is very much still live. */
const retiredTokens = new Set([...retiredSection.matchAll(/^- \*\*`(--fg-[\w-]+)`\*\*/gm)].map((m) => m[1]!));

const documentedConsumerTokens = new Set([...structuralRows, ...colourRows].map((r) => r.token));
const internalTokens = new Set(internalRows.map((r) => r.token));

// ---------------------------------------------------------------------------------------------
// Half 1a — every name the sheet defines is documented once, in the right place
// ---------------------------------------------------------------------------------------------

describe('the sheet and the published token tables name the same tokens', () => {
  it('documents every consumer-facing token the sheet defines (the 12-missing-token case)', () => {
    const undocumented = [...sheetDefinedTokens].filter(
      (token) => !documentedConsumerTokens.has(token) && !internalTokens.has(token),
    );
    expect(
      undocumented,
      `styles.ts defines these --fg-* tokens but docs/05-consumer-api.md's tables never mention them:\n${undocumented.join('\n')}`,
    ).toEqual([]);
  });

  it('never documents a consumer token the sheet does not define', () => {
    const phantom = [...documentedConsumerTokens].filter(
      (token) => !sheetDefinedTokens.has(token) && !(token in EXTERNAL_PIXEL_TOKENS),
    );
    expect(
      phantom,
      `docs/05-consumer-api.md documents these --fg-* tokens but styles.ts never defines them, and they are not on the known outside-the-sheet allowlist:\n${phantom.join('\n')}`,
    ).toEqual([]);
  });

  it('keeps every "Internal tokens" entry out of the consumer-facing tables', () => {
    const leaked = internalRows.filter((row) => documentedConsumerTokens.has(row.token));
    expect(
      leaked.map((r) => r.token),
      'an internal token also appears in a consumer-facing table — pick one home',
    ).toEqual([]);
  });

  it('only calls a sheet-defined token "internal" (no internal token invents a name the sheet never uses)', () => {
    const inventedInternal = internalRows.filter((row) => !sheetDefinedTokens.has(row.token));
    expect(
      inventedInternal.map((r) => r.token),
      'the Internal tokens table names a token styles.ts does not define',
    ).toEqual([]);
  });

  it('never lets a retired token come back into the sheet', () => {
    const revived = [...retiredTokens].filter((token) => sheetDefinedTokens.has(token));
    expect(
      revived,
      'a retired token is defined in styles.ts again — either it is not retired, or the sheet regressed',
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// Half 1b — the values the sheet ships and the values the doc promises agree
// ---------------------------------------------------------------------------------------------

describe('the sheet and the published token tables agree on every default', () => {
  it("matches every structural/pixel token's documented default to its real source", () => {
    const mismatches: string[] = [];
    for (const row of structuralRows) {
      const [token, documentedDefault] = row.cells;
      let actual: string;
      try {
        actual = resolvePixelTokenDefault(token!);
      } catch (error) {
        mismatches.push(`${token}: ${(error as Error).message}`);
        continue;
      }
      if (actual !== documentedDefault) {
        mismatches.push(`${token}: doc says "${documentedDefault}", the real source says "${actual}"`);
      }
    }
    expect(mismatches, mismatches.join('\n')).toEqual([]);
  });

  it("matches every colour/shadow token's documented light and dark defaults to the sheet", () => {
    const mismatches: string[] = [];
    for (const row of colourRows) {
      const [token, docLight, docDark] = row.cells;
      if (lightDeclared.has(token!) || darkDeclared.has(token!)) {
        // A themed token — declared once per theme block, so light and dark are checked apart.
        const sheetLight = lightDeclared.get(token!);
        const sheetDark = darkDeclared.get(token!);
        if (sheetLight !== docLight) {
          mismatches.push(`${token} (light): doc says "${docLight}", the sheet says "${sheetLight}"`);
        }
        if (sheetDark !== docDark) {
          mismatches.push(`${token} (dark): doc says "${docDark}", the sheet says "${sheetDark}"`);
        }
        continue;
      }
      // A single, theme-independent value (--fg-bar-opacity, --fg-ghost-opacity, --fg-pending-opacity)
      // — declared once on .fg-container or read once with a var() fallback, never per-theme. The
      // doc marks its own dark column "—" rather than restating the same number twice.
      const sheetValue = baseDeclared.get(token!) ?? baseVarFallback.get(token!);
      if (sheetValue !== docLight) {
        mismatches.push(`${token}: doc says "${docLight}", the sheet says "${sheetValue}"`);
      }
      if (!/^—/.test(docDark ?? '')) {
        mismatches.push(
          `${token}: is theme-independent in the sheet, but its doc row's dark column is "${docDark}", not "—"`,
        );
      }
    }
    expect(mismatches, mismatches.join('\n')).toEqual([]);
  });
});
