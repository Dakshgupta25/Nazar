import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import fs from 'fs';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'copy-manifest-and-icons',
      writeBundle() {
        if (!fs.existsSync('dist')) {
          fs.mkdirSync('dist', { recursive: true });
        }
        if (fs.existsSync('manifest.json')) {
          fs.copyFileSync('manifest.json', 'dist/manifest.json');
        }
        if (!fs.existsSync('dist/icons')) {
          fs.mkdirSync('dist/icons', { recursive: true });
        }
        if (fs.existsSync('public/icons')) {
          const files = fs.readdirSync('public/icons');
          for (const file of files) {
            fs.copyFileSync(`public/icons/${file}`, `dist/icons/${file}`);
          }
        }
        if (fs.existsSync('public/models')) {
          fs.cpSync('public/models', 'dist/models', { recursive: true });
        }
      }
    }
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'src/popup/popup.html'),
        serviceWorker: resolve(__dirname, 'src/background/serviceWorker.ts')
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'serviceWorker') {
            return 'serviceWorker.js';
          }
          return 'assets/[name]-[hash].js';
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
        manualChunks: (id) => {
          if (id.includes('node_modules/@tensorflow') || id.includes('node_modules/@tensorflow-models')) {
            return 'tfjs-vendor';
          }
          if (id.includes('node_modules/tesseract.js')) {
            return 'tesseract-vendor';
          }
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom') || id.includes('node_modules/lucide-react')) {
            return 'react-vendor';
          }
        }
      }
    }
  },
  // @ts-ignore vitest config type
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts']
  }
});
