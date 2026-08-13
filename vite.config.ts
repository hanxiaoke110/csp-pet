import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { rm, readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

function trimQuestionBankBuild() {
  return {
    name: 'trim-question-bank-build',
    async closeBundle() {
      await Promise.all([
        rm(resolve('dist/course-data/unified-quiz-bank.backup-1783601740325.json'), { force: true }),
        rm(resolve('dist/3d-preview.html'), { force: true }),
        rm(resolve('dist/batch-preview.html'), { force: true }),
        rm(resolve('dist/pet-preview.html'), { force: true }),
        rm(resolve('dist/pet-preview-all.html'), { force: true }),
      ]);
      const directory = resolve('dist/course-data/question-bank-v2');
      const manifest = JSON.parse(await readFile(resolve(directory, 'manifest.json'), 'utf8'));
      const retained = new Set([
        'manifest.json',
        ...Object.values(manifest.files).map((entry: unknown) => (entry as { path: string }).path),
      ]);
      for (const filename of await readdir(directory)) {
        if (!retained.has(filename)) await rm(resolve(directory, filename));
      }
    },
  };
}

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react(), trimQuestionBankBuild()],

  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
    // Redirect pet.html to main app in dev mode (Tauri handles it in production)
    proxy: {
      '/pet-window': {
        target: 'http://localhost:1420',
        rewrite: () => '/pet.html',
      },
    },
  },
  build: {
    modulePreload: false,
    target: 'es2015',
    rollupOptions: {
      input: {
        main: 'index.html',
        pet: 'pet.html',
        dungeon: 'src-dungeon/index.html',
      },
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
      },
    },
  },
}));
