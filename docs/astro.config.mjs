import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://standardbeagle.github.io',
  base: '/dart-query',
  integrations: [
    starlight({
      title: 'dart-query',
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
