import { defineConfig } from 'vite';

// Service Worker 单独构建：MV3 要求经典脚本（非 module），故输出 iife 格式，
// 且不清空 dist（在页面构建之后运行）。
export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    target: 'chrome114',
    lib: {
      entry: 'src/background/service-worker.ts',
      formats: ['iife'],
      name: 'AuraTabSW',
      fileName: () => 'background/service-worker.js',
    },
    rollupOptions: {
      output: { extend: true },
    },
  },
});
