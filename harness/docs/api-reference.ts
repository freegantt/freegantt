// D-S5-29: `etc/freegantt.api.md` is API Extractor's own report (`pnpm api-report`, I11) — the
// single, gated record of the exported surface. This page renders that file; it does not restate
// it. `?raw` reads the committed markdown in as a build-time string, the same way in `pnpm dev` and
// in `pnpm build` (Vite's own asset-as-string import, no plugin), so there is no second copy for a
// maintainer to keep in sync and no runtime fetch for a built harness to fail.
import apiReportRaw from '../../etc/freegantt.api.md?raw';

type ReportBlock =
  | { readonly kind: 'heading'; readonly level: number; readonly text: string }
  | { readonly kind: 'quote'; readonly text: string }
  | { readonly kind: 'code'; readonly lang: string; readonly text: string }
  | { readonly kind: 'paragraph'; readonly text: string };

// A reader for what this one generated file actually contains: a title, a blockquote note, and
// fenced code. Not a general markdown engine — plans/01 §8 wants text output kept small, and a
// generated API report needs nothing richer than headings, a quote and code fences.
function parseReport(markdown: string): readonly ReportBlock[] {
  const blocks: ReportBlock[] = [];
  const lines = markdown.split('\n');
  let paragraph: string[] = [];

  const flushParagraph = (): void => {
    const text = paragraph.join(' ').trim();
    if (text.length > 0) blocks.push({ kind: 'paragraph', text });
    paragraph = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      flushParagraph();
      blocks.push({ kind: 'heading', level: heading[1]!.length, text: heading[2]!.trim() });
      continue;
    }

    if (line.startsWith('>')) {
      flushParagraph();
      blocks.push({ kind: 'quote', text: line.replace(/^>\s?/, '') });
      continue;
    }

    const fenceOpen = /^```(\w*)/.exec(line);
    if (fenceOpen) {
      flushParagraph();
      const lang = fenceOpen[1] ?? '';
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !(lines[i] ?? '').startsWith('```')) {
        codeLines.push(lines[i] ?? '');
        i++;
      }
      blocks.push({ kind: 'code', lang, text: codeLines.join('\n') });
      continue;
    }

    if (line.trim().length === 0) {
      flushParagraph();
      continue;
    }

    paragraph.push(line.trim());
  }
  flushParagraph();

  return blocks;
}

// Inline marks the report actually emits: `code spans` and [links](url) — never bold or italic.
function appendInline(target: HTMLElement, text: string): void {
  const pattern = /`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    if (match.index > cursor) target.append(text.slice(cursor, match.index));
    if (match[1] !== undefined) {
      const code = document.createElement('code');
      code.textContent = match[1];
      target.append(code);
    } else if (match[2] !== undefined && match[3] !== undefined) {
      const link = document.createElement('a');
      link.href = match[3];
      link.textContent = match[2];
      target.append(link);
    }
    cursor = pattern.lastIndex;
  }
  if (cursor < text.length) target.append(text.slice(cursor));
}

function renderBlock(block: ReportBlock): HTMLElement {
  switch (block.kind) {
    case 'heading': {
      // This page's own h1/h2 own the top two levels; the report's own "##" title nests under them.
      const tag = block.level <= 2 ? 'h3' : 'h4';
      const el = document.createElement(tag);
      appendInline(el, block.text);
      return el;
    }
    case 'quote': {
      const el = document.createElement('blockquote');
      appendInline(el, block.text);
      return el;
    }
    case 'code': {
      const pre = document.createElement('pre');
      // The report's own declarations run past the pane width, so this block scrolls sideways —
      // give it a tab stop (WCAG 2.1.1 / axe scrollable-region-focusable) the way a keyboard-only
      // reader reaches any other scrollable region on the page.
      pre.tabIndex = 0;
      const code = document.createElement('code');
      if (block.lang) code.className = `language-${block.lang}`;
      code.textContent = block.text; // text, never innerHTML (plans/01 §8) — the report is plain text
      pre.append(code);
      return pre;
    }
    case 'paragraph': {
      const el = document.createElement('p');
      appendInline(el, block.text);
      return el;
    }
  }
}

/** Mounts the committed API report into `container`, as read text. */
export function mountApiReport(container: HTMLElement): void {
  for (const block of parseReport(apiReportRaw)) {
    container.append(renderBlock(block));
  }
}

const container = document.getElementById('api-report');
if (container) {
  mountApiReport(container);
}
