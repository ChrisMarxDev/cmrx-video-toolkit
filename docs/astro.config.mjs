import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
export default defineConfig({
  site: 'https://chrismarxdev.github.io',
  base: '/cmrx-video-toolkit',
  integrations: [starlight({
    title: 'CMRX Video Toolkit',
    description: 'Open tools and agent skills for programmable video.',
    social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/ChrisMarxDev/cmrx-video-toolkit' }],
    customCss: ['./src/styles/cmrx.css'],
    components: {
      ThemeProvider: './src/components/LightTheme.astro',
      ThemeSelect: './src/components/NoThemeSelect.astro',
    },
    expressiveCode: { themes: ['github-light'] },
    sidebar: [
      { label: 'Start here', items: [
        { label: 'Overview', slug: '' },
        { label: 'Quick start', slug: 'guides/quick-start' },
        { label: 'Video workflow', slug: 'guides/workflow' },
        { label: 'Your workspace & style', slug: 'guides/workspace' },
      ] },
      { label: 'Tools & reference', items: [{ autogenerate: { directory: 'reference' } }] },
    ],
  })],
});
