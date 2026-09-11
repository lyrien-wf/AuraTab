import { describe, expect, it } from 'vitest';
import { buildModel } from './bookmarks';
import {
  ENGINE_LABELS,
  SEARCH_LIMIT,
  buildSearchUrl,
  isEngineQuery,
  searchLinks,
  stripEnginePrefix,
} from './search';
import type { BookmarkTreeNode } from './chrome';
import type { BookmarkModel } from './types';

function makeModel(children: BookmarkTreeNode[]): BookmarkModel {
  return buildModel(children, { enabledRootIds: ['1'], showEmptyFolders: true });
}

const TREE: BookmarkTreeNode[] = [
  {
    id: '1',
    title: '收藏夹栏',
    children: [
      {
        id: '11',
        title: 'AI',
        children: [
          { id: 'a1', title: 'Claude', url: 'https://claude.ai' },
          { id: 'a2', title: 'Claude Docs', url: 'https://docs.claude.com' },
          { id: 'a3', title: 'My claude notes', url: 'https://example.com/notes' },
        ],
      },
      {
        id: '12',
        title: '开发',
        children: [
          { id: 'd1', title: '代码仓库', url: 'https://github.com/me' },
          { id: 'd2', title: '文档', url: 'https://a.com/react-docs' },
          { id: 'd3', title: 'javascript: 伪协议书签', url: 'javascript:alert(1)' },
        ],
      },
    ],
  },
];

const MODEL = makeModel(TREE);

describe('searchLinks 本地过滤', () => {
  it('不区分大小写，匹配标题', () => {
    const r = searchLinks(MODEL, 'CLAUDE', { scope: 'all' });
    expect(r.map((l) => l.id)).toEqual(['a1', 'a2', 'a3']);
  });

  it('打分排序：标题前缀 > 标题包含 > 域名包含 > url 包含', () => {
    const r = searchLinks(MODEL, 'clau', { scope: 'all' });
    // a1/a2 前缀命中；a3 标题包含；docs.claude.com 域名包含已被标题前缀覆盖
    expect(r.map((l) => l.id)).toEqual(['a1', 'a2', 'a3']);

    const byDomain = searchLinks(MODEL, 'github', { scope: 'all' });
    expect(byDomain.map((l) => l.id)).toEqual(['d1']); // 标题「代码仓库」不含 github，靠域名命中
  });

  it('url 命中兜底', () => {
    const r = searchLinks(MODEL, 'react', { scope: 'all' });
    expect(r.map((l) => l.id)).toEqual(['d2']);
  });

  it('无匹配返回空数组；空/纯空白查询返回空数组', () => {
    expect(searchLinks(MODEL, 'zzz-not-exist', { scope: 'all' })).toEqual([]);
    expect(searchLinks(MODEL, '', { scope: 'all' })).toEqual([]);
    expect(searchLinks(MODEL, '   ', { scope: 'all' })).toEqual([]);
  });

  it('scope=current 只搜当前目录', () => {
    const r = searchLinks(MODEL, 'claude', { scope: 'current', selectedFolderId: '12' });
    expect(r).toEqual([]);
    const r2 = searchLinks(MODEL, 'claude', { scope: 'current', selectedFolderId: '11' });
    expect(r2).toHaveLength(3);
  });

  it('结果上限 200 条', () => {
    const many: BookmarkTreeNode[] = [
      {
        id: '1',
        title: '收藏夹栏',
        children: Array.from({ length: 250 }, (_, i) => ({
          id: `m${i}`,
          title: `item ${i}`,
          url: `https://example.com/${i}`,
        })),
      },
    ];
    const m = makeModel(many);
    const r = searchLinks(m, 'item', { scope: 'all' });
    expect(r).toHaveLength(SEARCH_LIMIT);
    expect(SEARCH_LIMIT).toBe(200);
  });
});

describe('搜索引擎跳转', () => {
  it('? 前缀识别与剥离', () => {
    expect(isEngineQuery('?react hooks')).toBe(true);
    expect(isEngineQuery('  ?? x')).toBe(true);
    expect(isEngineQuery('react')).toBe(false);
    expect(stripEnginePrefix('?? react hooks ')).toBe('react hooks');
    expect(stripEnginePrefix('react')).toBe('react');
  });

  it('内置引擎 URL 正确且关键词被编码', () => {
    expect(buildSearchUrl({ searchEngine: 'bing' }, 'a b&c')).toBe('https://www.bing.com/search?q=a%20b%26c');
    expect(buildSearchUrl({ searchEngine: 'google' }, 'x')).toBe('https://www.google.com/search?q=x');
    expect(buildSearchUrl({ searchEngine: 'baidu' }, 'x')).toBe('https://www.baidu.com/s?wd=x');
  });

  it('custom 用 %s 占位符；缺模板时回退 Bing', () => {
    expect(buildSearchUrl({ searchEngine: 'custom', customSearchUrl: 'https://s.ex.com/?q=%s&lang=zh' }, 'hello world')).toBe(
      'https://s.ex.com/?q=hello%20world&lang=zh',
    );
    expect(buildSearchUrl({ searchEngine: 'custom' }, 'x')).toBe('https://www.bing.com/search?q=x');
    expect(buildSearchUrl({ searchEngine: 'custom', customSearchUrl: 'https://no-placeholder.com' }, 'x')).toBe(
      'https://www.bing.com/search?q=x',
    );
  });

  it('引擎标签齐全', () => {
    expect(Object.keys(ENGINE_LABELS).sort()).toEqual(['baidu', 'bing', 'custom', 'google']);
  });
});
