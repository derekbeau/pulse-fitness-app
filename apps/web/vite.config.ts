import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const monorepoRoot = path.resolve(__dirname, '../..');

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, monorepoRoot, '');

  const apiPort = env.VITE_API_PORT ?? '3001';
  const apiProxyTarget = env.VITE_API_PROXY_TARGET ?? `http://127.0.0.1:${apiPort}`;

  return {
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: {
        output: {
          // Bundle analysis (2026-03-10, `npx vite-bundle-visualizer`):
          // - Before manual chunking: `index-*.js` at ~145 kB gzip; `CartesianChart-*.js` at ~83 kB gzip
          // - After manual chunking: largest gzip chunk is `index-*.js` at ~109 kB gzip
          // - No chunk exceeded the 200 kB gzip budget
          // Keep vendor libraries split into stable chunks for long-term caching.
          manualChunks(id) {
            if (id.includes('/node_modules/recharts/')) {
              return 'vendor-recharts';
            }

            if (id.includes('/node_modules/@tanstack/react-query/')) {
              return 'vendor-query';
            }

            if (id.includes('/node_modules/react-router/')) {
              return 'vendor-router';
            }

            if (id.includes('/node_modules/zod/')) {
              return 'vendor-zod';
            }

            return undefined;
          },
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    server: {
      host: true,
      port: Number(env.VITE_PORT ?? 5173),
      strictPort: true,
      proxy: {
        '/api': {
          changeOrigin: true,
          target: apiProxyTarget,
        },
        '/health': {
          changeOrigin: true,
          target: apiProxyTarget,
        },
      },
    },
    test: {
      include: ['src/**/*.{test,spec}.{ts,tsx}'],
      environment: 'jsdom',
      setupFiles: './src/test/setup.ts',
    },
  };
});
