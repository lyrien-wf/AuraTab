import { describe, expect, it } from 'vitest';
import { isSafeUrl, navigateCurrent, safeHref } from './url';

describe('URL 协议校验', () => {
  it('允许 http / https / ftp', () => {
    expect(isSafeUrl('http://example.com')).toBe(true);
    expect(isSafeUrl('https://example.com/a?b=1#c')).toBe(true);
    expect(isSafeUrl('ftp://files.example.com/pub')).toBe(true);
  });

  it('拦截 javascript: 等伪协议', () => {
    expect(isSafeUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeUrl('JaVaScRiPt:alert(1)')).toBe(false); // URL 解析协议为小写
    expect(isSafeUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
    expect(isSafeUrl('vbscript:msgbox(1)')).toBe(false);
  });

  it('file: 默认拦截，allowFileUrls=true 时放行', () => {
    expect(isSafeUrl('file:///D:/docs/a.pdf')).toBe(false);
    expect(isSafeUrl('file:///D:/docs/a.pdf', true)).toBe(true);
  });

  it('非法 URL 返回 false', () => {
    expect(isSafeUrl('')).toBe(false);
    expect(isSafeUrl('not a url')).toBe(false);
  });

  it('safeHref：不安全链接返回 undefined', () => {
    expect(safeHref('javascript:alert(1)')).toBeUndefined();
    expect(safeHref('https://example.com')).toBe('https://example.com');
  });

  it('navigateCurrent：不安全链接拒绝跳转', () => {
    expect(navigateCurrent('javascript:alert(1)')).toBe(false);
  });
});
