import { defineConfig } from 'vite';
import { resolve } from 'path';
import { copyFileSync, readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, readdirSync } from 'fs';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'src/popup/index.html'),
        background: resolve(__dirname, 'src/background.ts'),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'background') {
            return 'background.js';
          }
          return 'popup/[name].js';
        },
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          if (assetInfo.names && assetInfo.names.some((n) => n.endsWith('.css'))) {
            return 'popup/popup.css';
          }
          return 'assets/[name][extname]';
        },
      },
    },
  },
  plugins: [
    {
      name: 'organize-extension-artifacts',
      closeBundle() {
        if (!existsSync('dist')) {
          mkdirSync('dist', { recursive: true });
        }

        // Copy manifest.json
        copyFileSync('manifest.json', 'dist/manifest.json');

        // Copy icons
        if (existsSync('icons')) {
          if (!existsSync('dist/icons')) {
            mkdirSync('dist/icons', { recursive: true });
          }
          const iconFiles = readdirSync('icons');
          for (const icon of iconFiles) {
            copyFileSync(`icons/${icon}`, `dist/icons/${icon}`);
          }
        }

        // Fix and place dist/popup/index.html with exact relative paths
        if (existsSync('dist/src/popup/index.html')) {
          if (!existsSync('dist/popup')) {
            mkdirSync('dist/popup', { recursive: true });
          }
          let html = readFileSync('dist/src/popup/index.html', 'utf-8');
          // Replace ../../popup/ or /popup/ with ./
          html = html.replace(/(\.\.\/)+popup\//g, './').replace(/\/popup\//g, './');
          writeFileSync('dist/popup/index.html', html, 'utf-8');
          rmSync('dist/src', { recursive: true, force: true });
        }
      },
    },
  ],
  test: {
    environment: 'node',
    globals: true,
  },
});
