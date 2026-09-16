import { themes as prismThemes } from 'prism-react-renderer';
import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

import path from 'node:path';

import linkOutsideDocsToGitHub from './plugins/link-outside-docs-to-github.mjs';

/** True for an ADR. Thirteen of them open with a `status:`/`decided:`/`open:` block that a reader
 *  sees on the page. It is prose between two rules, it is not YAML, and it is not front matter. */
function isDecisionRecord(filePath: string): boolean {
  return filePath.split(path.sep).join('/').includes('/docs/adr/');
}

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

const config: Config = {
  title: 'FreeGantt',
  tagline: 'A framework-free TypeScript Gantt/timeline library',
  favicon: 'img/favicon.ico',

  future: {
    v4: true,
  },

  url: 'https://pawel-it.github.io',
  baseUrl: '/FreeGantt/',

  organizationName: 'Pawel-IT',
  projectName: 'FreeGantt',

  onBrokenLinks: 'throw',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          // The repository's own `docs/` folder, served as it is written. There is no copy of it
          // here, so a page cannot drift from its source and a merge cannot conflict over output.
          path: '../docs',
          sidebarPath: './sidebars.ts',
          // A link that leaves `docs/` has no page to land on, so it becomes the file on GitHub.
          beforeDefaultRemarkPlugins: [linkOutsideDocsToGitHub],
          editUrl: ({ docPath }) => `https://github.com/Pawel-IT/FreeGantt/blob/main/docs/${docPath}`,
          routeBasePath: '/',
          // A page states when it was last made true. `last_update.date` in the front matter is that
          // statement; a page with none falls back to its last commit date.
          showLastUpdateTime: true,
        },
        blog: false,
        theme: {
          customCss: ['./src/css/custom.css', './src/css/architecture-doc.css'],
        },
      } satisfies Preset.Options,
    ],
  ],

  themes: ['@docusaurus/theme-mermaid'],
  markdown: {
    mermaid: true,
    // Architecture pages carry hand-built raw HTML/SVG (harness/docs migration, issue #352).
    // 'detect' parses .md files as plain CommonMark (no JSX/MDX compilation) so that HTML passes
    // through untouched; .mdx files, if any are added later, still get full MDX.
    format: 'detect',
    hooks: {
      onBrokenMarkdownLinks: 'throw',
    },
    // An ADR's opening block is body content, so Docusaurus must not read it as front matter.
    parseFrontMatter: async (params) =>
      isDecisionRecord(params.filePath)
        ? { frontMatter: {}, content: params.fileContent }
        : params.defaultParseFrontMatter(params),
  },

  plugins: [
    // The API reference is generated from `src/`, so it gets its own docs instance and stays out of
    // the authored `docs/` tree above.
    [
      '@docusaurus/plugin-content-docs',
      {
        id: 'api',
        path: 'docs/api',
        routeBasePath: 'api',
        sidebarPath: './sidebars-api.ts',
      },
    ],
    [
      'docusaurus-plugin-typedoc',
      {
        entryPoints: ['../src/api/index.ts'],
        tsconfig: './tsconfig.typedoc.json',
        out: 'docs/api',
        sidebar: false,
        readme: 'none',
        excludeExternals: true,
        excludePrivate: true,
        excludeProtected: true,
      },
    ],
  ],

  themeConfig: {
    colorMode: {
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'FreeGantt',
      logo: {
        alt: 'FreeGantt logo',
        src: 'img/logo.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'guidesSidebar',
          position: 'left',
          label: 'Guides',
        },
        {
          type: 'docSidebar',
          sidebarId: 'architectureSidebar',
          position: 'left',
          label: 'Architecture',
        },
        {
          type: 'docSidebar',
          sidebarId: 'adrSidebar',
          position: 'left',
          label: 'ADRs',
        },
        {
          type: 'docSidebar',
          sidebarId: 'apiSidebar',
          docsPluginId: 'api',
          position: 'left',
          label: 'API reference',
        },
        {
          href: 'https://github.com/Pawel-IT/FreeGantt',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            { label: 'Guides', to: '/' },
            { label: 'ADRs', to: '/adr/' },
            { label: 'API reference', to: '/api/' },
          ],
        },
        {
          title: 'More',
          items: [{ label: 'GitHub', href: 'https://github.com/Pawel-IT/FreeGantt' }],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} FreeGantt. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['bash', 'diff', 'json'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
