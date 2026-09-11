import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// 页面构建：newtab / options / popup 三个 HTML 入口，产物平铺在 dist 根目录，
// 与 manifest.json 中的路径（newtab.html、options.html、popup.html）保持一致。
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'chrome114',
    rollupOptions: {
      input: {
        newtab: 'newtab.html',
        options: 'options.html',
        popup: 'popup.html',
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
