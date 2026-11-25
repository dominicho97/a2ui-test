import path from 'node:path';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

import { investigateApiPlugin } from './server/apiPlugin';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  // Empty prefix loads non-VITE_ variables too. They stay in this Node process:
  // they are passed to the server plugin only and are NOT added to `define`.
  const env = loadEnv(mode, rootDir, '');

  return {
    plugins: [react(), investigateApiPlugin({ apiKey: env.OPENAI_API_KEY, model: env.OPENAI_MODEL })],
    resolve: {
      alias: {
        '@': path.resolve(rootDir, 'src'),
      },
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}', 'server/**/*.test.ts'],
    },
  };
});
