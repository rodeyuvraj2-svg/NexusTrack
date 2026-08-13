import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://themewagon.github.io/tailcast',
  integrations: [sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
});
