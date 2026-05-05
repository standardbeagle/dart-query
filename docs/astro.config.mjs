import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://standardbeagle.github.io',
  base: '/dart-query',
  integrations: [
    starlight({
      title: 'dart-query',
      description: 'MCP server for Dart AI with batch operations, DartQL selectors, CSV import, and zero context rot. Update hundreds of tasks in a single call.',
      head: [
        {
          tag: 'meta',
          attrs: { name: 'twitter:card', content: 'summary' },
        },
        {
          tag: 'meta',
          attrs: { name: 'twitter:site', content: '@standardbeagle' },
        },
        {
          tag: 'meta',
          attrs: { property: 'og:type', content: 'website' },
        },
        {
          tag: 'meta',
          attrs: { property: 'og:site_name', content: 'dart-query' },
        },
      ],
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/standardbeagle/dart-query',
        },
      ],
      sidebar: [
        {
          label: 'Getting Started',
          autogenerate: { directory: 'getting-started' },
        },
        {
          label: 'Tools',
          autogenerate: { directory: 'tools' },
        },
        {
          label: 'DartQL Reference',
          autogenerate: { directory: 'dartql' },
        },
        {
          label: 'Cookbook',
          autogenerate: { directory: 'cookbook' },
        },
        {
          label: 'Features',
          autogenerate: { directory: 'features' },
        },
      ],
    }),
    sitemap(),
  ],
});
