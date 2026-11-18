/// <reference types="vitest/config" />
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { buildManifest } from './manifest.config';

function manifest(): Plugin {
  return {
    name: 'extension-manifest',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'manifest.json',
        source: JSON.stringify(buildManifest(), null, 2),
      });
    },
  };
}

export default defineConfig({
  root: 'src',
  publicDir: resolve(__dirname, 'public'),
  plugins: [manifest()],
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    target: 'chrome116',
    rollupOptions: {
      input: {
        viewer: resolve(__dirname, 'src/viewer.html'),
        background: resolve(__dirname, 'src/background/index.ts'),
      },
      output: {
        // The manifest points at a fixed path for the service worker.
        entryFileNames: (chunk) =>
          chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js',
      },
    },
  },
  test: {
    root: __dirname,
    include: ['test/**/*.test.ts'],
  },
});
