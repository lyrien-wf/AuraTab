// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { LinkNode } from '../../core/types';
import { BookmarkCard } from './BookmarkCard';

// vitest 未开 globals，RTL 不会自动清理，用例间手动 unmount
afterEach(cleanup);

const link = (url: string): LinkNode => ({
  id: '1',
  title: '示例',
  url,
  parentId: 'p',
  domain: 'example.com',
});

/** 被拦截卡片的可达性（P2-6 修复验证） */
describe('BookmarkCard 拦截态无障碍', () => {
  it('安全链接：有 href、无 aria-disabled', () => {
    render(
      <BookmarkCard link={link('https://example.com')} allowFileUrls={false} openInNewTab={false} onContextMenu={() => {}} />,
    );
    const a = screen.getByRole('link');
    expect(a.getAttribute('href')).toBe('https://example.com');
    expect(a.getAttribute('aria-disabled')).toBeNull();
    expect(a.getAttribute('target')).toBeNull();
  });

  it('开启新标签页设置：安全链接带 target=_blank', () => {
    render(
      <BookmarkCard link={link('https://example.com')} allowFileUrls={false} openInNewTab={true} onContextMenu={() => {}} />,
    );
    expect(screen.getByRole('link').getAttribute('target')).toBe('_blank');
  });

  it('被拦截链接：无 href 但键盘可达、读屏播报不可用', () => {
    render(
      <BookmarkCard link={link('javascript:alert(1)')} allowFileUrls={false} openInNewTab={true} onContextMenu={() => {}} />,
    );
    const a = screen.getByRole('link');
    expect(a.getAttribute('href')).toBeNull();
    expect(a.getAttribute('target')).toBeNull();
    expect(a.getAttribute('aria-disabled')).toBe('true');
    expect(a.tabIndex).toBe(0);
  });
});
