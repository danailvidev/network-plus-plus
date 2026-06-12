import { defineConfig } from 'wxt';

export default defineConfig({
  manifestVersion: 3,
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Network++',
    short_name: 'Network++',
    description: 'Enhanced Chrome DevTools network panel with powerful search, GraphQL insight, and export tools.',
    version: '0.1.0',
    devtools_page: 'devtools.html',
    icons: {
      16: 'icons/icon-16.png',
      32: 'icons/icon-32.png',
      48: 'icons/icon-48.png',
      128: 'icons/icon-128.png'
    },
    permissions: ['storage']
  }
});
