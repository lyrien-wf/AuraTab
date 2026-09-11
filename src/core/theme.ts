/**
 * 主题应用：跟随 prefers-color-scheme，settings.theme 可强制 light/dark。
 * 通过在 <html> 上设置 data-theme 驱动 CSS 变量。
 */
import type { Settings } from './types';

export type ResolvedTheme = 'light' | 'dark';

export function resolveTheme(theme: Settings['theme']): ResolvedTheme {
  if (theme !== 'system') return theme;
  const mq = globalThis.matchMedia?.('(prefers-color-scheme: dark)');
  return mq?.matches ? 'dark' : 'light';
}

/** 应用主题并（system 模式下）监听系统切换，返回清理函数 */
export function initTheme(theme: Settings['theme']): () => void {
  if (typeof document === 'undefined') return () => {};
  const mq = globalThis.matchMedia?.('(prefers-color-scheme: dark)');

  const apply = () => {
    document.documentElement.dataset.theme = resolveTheme(theme);
  };
  apply();

  if (theme !== 'system' || !mq?.addEventListener) return () => {};
  mq.addEventListener('change', apply);
  return () => mq.removeEventListener('change', apply);
}
