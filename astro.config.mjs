// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import expressiveCode from 'astro-expressive-code';
import { remarkPlantuml } from './src/lib/remark-plantuml.mjs';
import { remarkD2 } from './src/lib/remark-d2.mjs';
import { remarkReadingTime } from './src/lib/remark-reading-time.mjs';
import { rehypeHeadingAnchors } from './src/lib/rehype-heading-anchors.mjs';

export default defineConfig({
  site: 'https://samadeep.github.io',
  trailingSlash: 'always',
  prefetch: { prefetchAll: true, defaultStrategy: 'hover' },
  // old Chirpy URLs that no longer have their own page
  redirects: {
    '/categories/': '/posts/',
    '/archives/': '/posts/',
    '/topics/': '/posts/',
  },
  markdown: {
    remarkPlugins: [remarkD2, remarkPlantuml, remarkReadingTime],
    rehypePlugins: [rehypeHeadingAnchors],
  },
  integrations: [
    expressiveCode({
      themes: ['github-light', 'github-dark-dimmed'],
      themeCssSelector: (theme) => `[data-theme='${theme.type}']`,
      useDarkModeMediaQuery: false,
      // tokens are nudged until they reach 5.5:1 on the backgrounds below
      minSyntaxHighlightingColorContrast: 5.5,
      styleOverrides: {
        borderRadius: '6px',
        codeBackground: ['#0a1e1d', '#f3f0e5'], // [dark, light]: Ink Black / Warm Ivory family
        borderColor: ['#1d3331', '#cdc8b2'],
        codeFontFamily: "'Aptos Mono', 'JetBrains Mono Variable', ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
        codeFontSize: '0.84rem',
        uiFontFamily: "'Aptos Mono', 'JetBrains Mono Variable', ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
      },
      defaultProps: { wrap: false },
    }),
    mdx(),
    sitemap(),
  ],
});
