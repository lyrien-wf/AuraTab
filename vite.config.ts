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
      // 固定产物文件名（去 hash）：扩展资源从本地磁盘加载，不需要缓存指纹；
      // 重建时同名覆盖，不再出现"旧标签页 / 旧 HTML 缓存请求已删除的哈希文件 → 白屏"（P2-11）
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]',
      },
    },
  },
  test: {
    // 默认 node；组件测试在文件头用 `// @vitest-environment jsdom` 按需切换（P2-13）
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
