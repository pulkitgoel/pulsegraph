import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const policy = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  "connect-src 'self' https://api.deepseek.com http://localhost:11434",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

export default defineConfig(({ command }) => ({
  // GitHub Pages serves this project from https://<user>.github.io/pulsegraph/,
  // so the built asset URLs need that prefix. Only the Pages workflow sets
  // GITHUB_PAGES, which leaves dev, preview and the Playwright suite serving
  // from the root exactly as before.
  base: process.env.GITHUB_PAGES ? '/pulsegraph/' : '/',
  plugins: [
    react(),
    {
      name: 'production-content-security-policy',
      transformIndexHtml() {
        if (command !== 'build') return [];
        return [
          {
            tag: 'meta',
            attrs: { 'http-equiv': 'Content-Security-Policy', content: policy },
            injectTo: 'head-prepend',
          },
        ];
      },
    },
  ],
}));
