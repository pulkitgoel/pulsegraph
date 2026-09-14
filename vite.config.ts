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
