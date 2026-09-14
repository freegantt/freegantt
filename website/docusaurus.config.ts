import { themes as prismThemes } from 'prism-react-renderer';
import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

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
  onBrokenMarkdownLinks: 'throw',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          editUrl: 'https://github.com/Pawel-IT/FreeGantt/tree/main/website/',
          routeBasePath: '/',
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
  },

  plugins: [
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
    image: 'img/docusaurus-social-card.jpg',
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
            { label: 'Guides', to: '/guides/guardrails-overview' },
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
