/** Lines in the text that name a coding tool as author. */
export function aiToolAttributionIn(text: string): string[];

/** Drop those lines. Git `#` comments stay. */
export function messageWithoutAiToolAttribution(text: string): {
  text: string;
  dropped: string[];
};

/** Title and body `pnpm open-pr` will send, joined for one scan. */
export function openPrCopy(
  args: readonly string[],
  readFile?: (path: string, encoding: 'utf8') => string,
): string;

export function refuseAiToolAttributionMessage(hits: readonly string[]): string;
