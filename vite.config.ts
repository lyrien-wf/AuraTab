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
    // 关闭 Vite 注入的 <link rel="modulepreload"> 与预加载 polyfill：
    // 扩展页里这些预加载会被 Chrome 判为 cross-world extension resource mismatch，
    // 白刷 4 条 Issues 却毫无收益 —— 资源就在本地，且代码里没有动态 import()，
    // 静态依赖由入口 <script type="module"> 直接拉取（chrome114 原生支持模块）。
    modulePreload: false,
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
