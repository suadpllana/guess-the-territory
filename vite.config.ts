import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
let commit = 'dev';
try {
  commit = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
} catch {
  // not a git checkout
}

export default defineConfig(({ mode }) => ({
  // Poki serves the game from a sub-path: every URL must be relative.
  base: './',
  define: {
    __BUILD__: JSON.stringify(`${pkg.version}-${commit}`),
    __ADS__: JSON.stringify(mode === 'ads'),
  },
  build: {
    target: 'es2020',
    sourcemap: false,
    assetsInlineLimit: 100000,
    cssCodeSplit: false,
    modulePreload: false,
    reportCompressedSize: true,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/game-[hash].js',
        assetFileNames: 'assets/game-[hash][extname]',
      },
    },
  },
  server: { host: true },
}));
