/**
 * URL 协议安全校验（对应开发文档第 9 章）。
 * 只允许 http / https / ftp；file 默认关闭、可配置放开；
 * 拦截 javascript: 等伪协议书签，防止恶意书签执行脚本。
 */

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'ftp:']);

export function isSafeUrl(url: string, allowFileUrls = false): boolean {
  try {
    const parsed = new URL(url);
    return ALLOWED_PROTOCOLS.has(parsed.protocol) || (allowFileUrls && parsed.protocol === 'file:');
  } catch {
    return false;
  }
}

/** 供 <a href> 使用：不安全链接返回 undefined（渲染为不可点击并标记「已拦截」） */
export function safeHref(url: string, allowFileUrls = false): string | undefined {
  return isSafeUrl(url, allowFileUrls) ? url : undefined;
}

/** 在当前标签页打开（校验协议后跳转） */
export function navigateCurrent(url: string, allowFileUrls = false): boolean {
  if (!isSafeUrl(url, allowFileUrls)) return false;
  globalThis.location.href = url;
  return true;
}
