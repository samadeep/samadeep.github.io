// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import expressiveCode from 'astro-expressive-code';
import { remarkPlantuml } from './src/lib/remark-plantuml.mjs';
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
  },
  markdown: {
    remarkPlugins: [remarkPlantuml, remarkReadingTime],
    rehypePlugins: [rehypeHeadingAnchors],
  },
  integrations: [
    expressiveCode({
      themes: ['github-light', 'github-dark-dimmed'],
      themeCssSelector: (theme) => `[data-theme='${theme.type}']`,
      useDarkModeMediaQuery: false,
      styleOverrides: {
        borderRadius: '6px',
        codeFontFamily: "'JetBrains Mono Variable', ui-monospace, monospace",
        codeFontSize: '0.84rem',
        uiFontFamily: "'Schibsted Grotesk Variable', system-ui, sans-serif",
      },
      defaultProps: { wrap: false },
    }),
    mdx(),
    sitemap(),
  ],
});
