import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { readFileSync } from 'fs';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf-8'));
const gitHash = execSync('git rev-parse --short HEAD').toString().trim();

export default defineConfig({
  base: process.env.VITE_BASE_URL ?? '/',
  plugins: [tailwindcss(), svelte()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __GIT_HASH__: JSON.stringify(gitHash),
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
        app:   resolve(__dirname, 'app/index.html'),
      },
    },
  },
});
