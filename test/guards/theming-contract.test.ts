// #261 / #334: `plans/02` §4 was once the only published home of the Customization ladder, and by
// the time S5 audited it, it had been wrong for three slices with every gate green the whole time —
// twelve live tokens missing, a stale colour palette, a wrong published default, a selector that
// matched nothing. #221 question 1 moved the level-1 token reference to `docs/05-consumer-api.md`
// and corrected it once (`46db903`). Half 1 (`#261`) parses `src/view/styles.ts` for every `--fg-*`
// token the sheet actually carries, and fails when that set (or a documented default) disagrees with
// `docs/05-consumer-api.md`'s tables. Half 2 (`#334`) does the same for every `.fg-*` class: the
// base sheet plus the two glyph classes `summary()` and `diamond()` ship in their own CSS.
//
// #383 closed the gap CLAUDE.md's stop rule named `--fg-grid-pane-width` as exactly (#157): every
// documented token now carries a real `:root` declaration, so a consumer's own CSS can read its
// default back with a bare `var(--fg-x)`. `--fg-row-height`, `--fg-grid-pane-width` and five more
// still read, in TypeScript, through `pixel-property.ts` — their `:root` declaration exists only so a
// consumer can see the default; `pixel-property.ts`'s own JS-side constant stays the guard against an
// *invalid* authored value, a different job (docs/05-consumer-api.md, "Structural pixel tokens").
// Each one's `:root` line interpolates that same TypeScript constant (`${DEFAULT_ROW_HEIGHT}px`) rather
// than restating the number as a literal, so this guard checks it against the TypeScript file that
// actually owns it, named per token below, instead of trying to parse the interpolation as a value.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel: string): string => fs.readFileSync(path.join(root, rel), 'utf8');

const styles = read('src/view/styles.ts');
const variants = read('src/layout/bars/variants.ts');
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
// #383: every consumer-facing metric's own `:root` declaration — a separate template literal, the
// same reason LIGHT_COLOR_TOKENS/DARK_COLOR_TOKENS above get their own `extractTemplate` call
// instead of being read off `BASE_STYLESHEET` directly (its own source only carries
// `${METRIC_TOKENS}`, not the interpolated text, until the module actually runs).
const metricDeclared = declarationsIn(extractTemplate('METRIC_TOKENS'));
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
  ...metricDeclared.keys(),
  ...baseDeclared.keys(),
  ...baseVarFallback.keys(),
]);

// ---------------------------------------------------------------------------------------------
// Tokens whose `:root` declaration interpolates a TypeScript constant (`${SOME_CONSTANT}px`)
// rather than restating the number as a literal — the value the guard must check is the
// constant's own source, named here, the same import `styles.ts` itself uses. Each entry names
// the file and the exact source line pattern that carries the number, so a future change to that
// constant flows through this guard without anyone having to remember to update it here.
// ---------------------------------------------------------------------------------------------

interface ExternalDefault {
  file: string;
  pattern: RegExp;
  unit: 'px' | '';
  /** #437: most entries below are one literal a pattern captures whole (`match[1]`). A token whose
   *  default is computed, not written as a literal, needs its computation read out of the pattern's
   *  own capture groups instead — so this runs the pattern's *own* match, and must derive the result
   *  only from numbers the pattern captured, never from a number this test writes itself. That is
   *  what makes the guard check the arithmetic the sheet runs, not a copy of it. */
  resolve?: (match: RegExpExecArray) => number;
}

const INTERPOLATED_STRUCTURAL_TOKENS: Record<string, ExternalDefault> = {
  '--fg-row-height': {
    file: 'src/view/frame-settings.ts',
    pattern: /export const DEFAULT_ROW_HEIGHT = (\d+(?:\.\d+)?);/,
    unit: 'px',
  },
  '--fg-grid-pane-width': {
    file: 'src/view/pane-layout.ts',
    pattern: /export const DEFAULT_GRID_PANE_WIDTH_PX = (\d+(?:\.\d+)?);/,
    unit: 'px',
  },
  '--fg-splitter-width': {
    file: 'src/view/pane-layout.ts',
    pattern: /export const DEFAULT_SPLITTER_WIDTH_PX = (\d+(?:\.\d+)?);/,
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
    pattern: /export const DEFAULT_COLUMN_MIN_WIDTH_PX = (\d+(?:\.\d+)?);/,
    unit: 'px',
  },
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
  // #392: these two have no other TS reader (styles.ts is the constant's only owner — no `export`),
  // so the pattern below matches the local `const`, not an `export const` like every entry above.
  '--fg-band-height': {
    file: 'src/view/styles.ts',
    pattern: /const DEFAULT_BAND_HEIGHT_PX = (\d+(?:\.\d+)?);/,
    unit: 'px',
  },
  '--fg-bar-radius': {
    file: 'src/view/styles.ts',
    pattern: /const DEFAULT_BAR_RADIUS_PX = (\d+(?:\.\d+)?);/,
    unit: 'px',
  },
  // #437: a stacking position, not a pixel length — same posture as the two entries above (a local,
  // un-exported `const` in styles.ts is the value's only source). `DEFAULT_OVERLAY_Z_INDEX` is
  // `Math.max(...Object.values(INTERNAL_Z)) + 1`, not its own literal, so the pattern below captures
  // both operands the sheet actually adds — every number inside the `INTERNAL_Z` object literal (its
  // own group), and the `+ 1` on `DEFAULT_OVERLAY_Z_INDEX`'s own line (a second group) — and `resolve`
  // runs that same `Math.max(...) + N` on the captured numbers. A tier `INTERNAL_Z` gains later is
  // still inside the first group, so it raises the computed default with no change needed here.
  '--fg-z-overlay': {
    file: 'src/view/styles.ts',
    pattern:
      /const INTERNAL_Z = \{([\s\S]*?)\} as const;[\s\S]*?const DEFAULT_OVERLAY_Z_INDEX = Math\.max\(\.\.\.Object\.values\(INTERNAL_Z\)\) \+ (\d+);/,
    unit: '',
    resolve: (match) => {
      const tiers = [...match[1]!.matchAll(/:\s*(\d+)/g)].map((tier) => Number(tier[1]));
      return Math.max(...tiers) + Number(match[2]);
    },
  },
};

// #392: the colour section's own two theme-independent, unitless tokens — same posture as
// INTERPOLATED_STRUCTURAL_TOKENS above (a local, un-exported `const` in styles.ts is the value's only
// source, so this map, not `metricDeclared`'s unexpanded `${…}` template text, is what resolves it).
const INTERPOLATED_COLOUR_TOKENS: Record<string, ExternalDefault> = {
  '--fg-ghost-opacity': {
    file: 'src/view/styles.ts',
    pattern: /const DEFAULT_GHOST_OPACITY = ([\d.]+);/,
    unit: '',
  },
  '--fg-pending-opacity': {
    file: 'src/view/styles.ts',
    pattern: /const DEFAULT_PENDING_OPACITY = ([\d.]+);/,
    unit: '',
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
  const resolved = def.resolve ? def.resolve(match) : Number(match[1]);
  return `${resolved}${def.unit}`;
}

/** A structural/pixel token's real default, resolved from wherever it actually lives — a
 *  TypeScript constant the `:root` declaration interpolates, `METRIC_TOKENS`'s own `:root`
 *  declaration (the value that ships — #392), or, failing both, the sheet's own literal
 *  `var(…, default)` fallback. `metricDeclared` goes first: once `:root` declares a token
 *  unconditionally, any inline `var(--fg-x, literal)` fallback a library rule still carries for it
 *  is unreachable — that property always already has a value by the time the rule reads it — so
 *  the inline literal is dead and must never be preferred over the value `:root` actually ships. */
function resolvePixelTokenDefault(token: string): string {
  if (token in INTERPOLATED_STRUCTURAL_TOKENS)
    return resolveExternalDefault(token, INTERPOLATED_STRUCTURAL_TOKENS[token]!);
  const literal = metricDeclared.get(token) ?? baseVarFallback.get(token) ?? baseDeclared.get(token);
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
    const phantom = [...documentedConsumerTokens].filter((token) => !sheetDefinedTokens.has(token));
    expect(
      phantom,
      `docs/05-consumer-api.md documents these --fg-* tokens but styles.ts never defines them:\n${phantom.join('\n')}`,
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

  it('never lets a token declared in METRIC_TOKENS drift from its own inline var() fallback', () => {
    // A token :root always declares (METRIC_TOKENS) makes any inline `var(--fg-x, literal)`
    // fallback for that same token unreachable — the property already has a value by the time the
    // rule reads it. The dead fallback still LOOKS live, so nothing stops it silently drifting from
    // the value that actually ships. This is the guard for that: every token both blocks declare
    // must still agree, so an edit to one without the other fails here instead of shipping quietly.
    const mismatches: string[] = [];
    for (const [token, metricValue] of metricDeclared) {
      const fallbackValue = baseVarFallback.get(token);
      if (fallbackValue === undefined) continue;
      if (fallbackValue !== metricValue) {
        mismatches.push(
          `${token}: METRIC_TOKENS declares "${metricValue}" on :root, but an inline var(--fg-x, …) fallback still says "${fallbackValue}" — the sheet ships the :root value, so the inline fallback is dead and must match it`,
        );
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
      // — declared once on .fg-container, once on :root via METRIC_TOKENS, or read once with a
      // var() fallback, never per-theme. INTERPOLATED_COLOUR_TOKENS goes first for a token whose
      // METRIC_TOKENS line interpolates a TS constant (metricDeclared would otherwise capture the
      // unexpanded `${…}` template text). Failing that, metricDeclared goes before baseDeclared/
      // baseVarFallback for the same reason resolvePixelTokenDefault prefers it: the :root
      // declaration is the value that ships, and an inline var() fallback for the same token is
      // dead once :root always sets it. The doc marks its own dark column "—" rather than
      // restating the same number twice.
      const sheetValue =
        token! in INTERPOLATED_COLOUR_TOKENS
          ? resolveExternalDefault(token!, INTERPOLATED_COLOUR_TOKENS[token!]!)
          : (metricDeclared.get(token!) ?? baseDeclared.get(token!) ?? baseVarFallback.get(token!));
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

// ---------------------------------------------------------------------------------------------
// Half 2 — every `.fg-*` class the sheet (or a shipped variant's CSS) defines is documented once
// ---------------------------------------------------------------------------------------------

/** Pulls one `const NAME = \`...\`;` template literal's own text — variant CSS is a bare literal,
 *  not a `.trim()` call the way `BASE_STYLESHEET` is. */
function extractCssLiteral(source: string, constName: string, fileLabel: string): string {
  const re = new RegExp(`const ${constName} = \`([\\s\\S]*?)\`;`);
  const match = re.exec(source);
  if (!match) {
    throw new Error(`theming-contract guard: could not find "${constName}" in ${fileLabel}`);
  }
  return match[1]!;
}

/** Every `.fg-*` class a block of CSS actually selects on. Comments are stripped first so a prose
 *  mention (`.fg-overlay's inset: 0`) cannot invent a class the sheet never defined as a rule. */
function classesIn(block: string): Set<string> {
  const withoutComments = block.replace(/\/\*[\s\S]*?\*\//g, '');
  return new Set([...withoutComments.matchAll(/\.fg-[a-z0-9-]+/g)].map((m) => m[0]!));
}

const sheetDefinedClasses = classesIn(baseBlock);
const variantDefinedClasses = new Set([
  ...classesIn(extractCssLiteral(variants, 'SUMMARY_CSS', 'src/layout/bars/variants.ts')),
  ...classesIn(extractCssLiteral(variants, 'DIAMOND_CSS', 'src/layout/bars/variants.ts')),
]);
const definedClasses = new Set([...sheetDefinedClasses, ...variantDefinedClasses]);

function partRows(sectionText: string): { part: string }[] {
  return sectionText
    .split('\n')
    .filter((line) => /^\|\s*`\.fg-/.test(line))
    .map((line) => {
      const cells = line
        .split('|')
        .map((cell) => cell.trim())
        .filter((_, i, arr) => i > 0 && i < arr.length - 1);
      const part = cells[0]!.replace(/`/g, '');
      return { part };
    });
}

const publicPartsSection = section('### Public Parts', /^### /m);
const internalPartsSection = section('### Internal Parts', /^## /m);
const publicPartRows = partRows(publicPartsSection);
const internalPartRows = partRows(internalPartsSection);
const documentedPublicParts = new Set(publicPartRows.map((r) => r.part));
const documentedInternalParts = new Set(internalPartRows.map((r) => r.part));

describe('the sheet and the published Parts tables name the same classes', () => {
  it('documents every class the sheet and the shipped variants define', () => {
    const undocumented = [...definedClasses].filter(
      (cls) => !documentedPublicParts.has(cls) && !documentedInternalParts.has(cls),
    );
    expect(
      undocumented,
      `styles.ts / shipped variant CSS define these .fg-* classes but docs/05-consumer-api.md's Parts tables never mention them:\n${undocumented.join('\n')}`,
    ).toEqual([]);
  });

  it('never documents a class the sheet and the shipped variants do not define', () => {
    const phantom = [...documentedPublicParts, ...documentedInternalParts].filter(
      (cls) => !definedClasses.has(cls),
    );
    expect(
      phantom,
      `docs/05-consumer-api.md documents these .fg-* classes but neither styles.ts nor the shipped variant CSS defines them:\n${phantom.join('\n')}`,
    ).toEqual([]);
  });

  it('keeps every Internal Parts entry out of the public table', () => {
    const leaked = internalPartRows.filter((row) => documentedPublicParts.has(row.part));
    expect(
      leaked.map((r) => r.part),
      'an internal Part also appears in the public table — pick one home',
    ).toEqual([]);
  });

  it('only calls a defined class "internal" (no internal Part invents a name the sheet never uses)', () => {
    const inventedInternal = internalPartRows.filter((row) => !definedClasses.has(row.part));
    expect(
      inventedInternal.map((r) => r.part),
      'the Internal Parts table names a class styles.ts and the shipped variants do not define',
    ).toEqual([]);
  });

  it('puts every variant glyph class in the public table, not the internal one', () => {
    const buried = [...variantDefinedClasses].filter((cls) => documentedInternalParts.has(cls));
    expect(
      buried,
      'a shipped variant glyph class is marked internal — summary() and diamond() are level-2 surface',
    ).toEqual([]);
  });
});
