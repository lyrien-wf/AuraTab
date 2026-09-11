import { describe, expect, it } from 'vitest';
import { buildModel, parseDomain } from './bookmarks';
import type { BookmarkTreeNode } from './chrome';

/** 混合目录与书签、空目录、深层嵌套、标题重复的测试树 */
const ROOT_CHILDREN: BookmarkTreeNode[] = [
  {
    id: '1',
    title: '收藏夹栏',
    children: [
      {
        id: '11',
        title: 'nas',
        children: [
          { id: '1101', title: 'NAS 面板', url: 'https://nas.example.com/admin' },
          {
            id: '111',
            title: '本地',
            children: [{ id: '1111', title: '影音', url: 'https://192.168.1.10:8096' }],
          },
          {
            id: '112',
            title: 'hk',
            children: [{ id: '1121', title: '监控', url: 'https://hk.example.com/status' }],
          },
        ],
      },
      {
        id: '12',
        title: 'AI',
        children: [
          { id: '1201', title: 'Claude', url: 'https://claude.ai' },
          { id: '1202', title: 'Docs', url: 'https://docs.anthropic.com' },
        ],
      },
      {
        id: '13',
        title: '空目录',
        children: [{ id: '131', title: '也是空的', children: [] }],
      },
      { id: '14', title: 'GitHub', url: 'https://github.com' },
      {
        id: '15',
        title: 'nas', // 标题重复
        children: [{ id: '1501', title: '另一个 nas 入口', url: 'https://nas2.example.com' }],
      },
    ],
  },
  {
    id: '2',
    title: '其他收藏夹',
    children: [{ id: '21', title: 'MDN', url: 'https://developer.mozilla.org' }],
  },
  { id: '3', title: '移动收藏夹', children: [] },
];

const ONLY_BAR = { enabledRootIds: ['1'], showEmptyFolders: false };

describe('buildModel 树构建', () => {
  it('根/深度/层级正确', () => {
    const m = buildModel(ROOT_CHILDREN, ONLY_BAR);
    expect(m.roots).toHaveLength(1);
    expect(m.roots[0].title).toBe('收藏夹栏');
    expect(m.roots[0].depth).toBe(0);
    const nas = m.folderIndex.get('11')!;
    expect(nas.depth).toBe(1);
    expect(nas.children.map((c) => c.title)).toEqual(['本地', 'hk']);
    expect(m.folderIndex.get('111')!.depth).toBe(2);
  });

  it('linkCount 只统计直接子书签，deepLinkCount 递归统计', () => {
    const m = buildModel(ROOT_CHILDREN, ONLY_BAR);
    const nas = m.folderIndex.get('11')!;
    expect(nas.linkCount).toBe(1);
    expect(nas.deepLinkCount).toBe(3);
    expect(m.roots[0].linkCount).toBe(1); // 仅 GitHub
    expect(m.roots[0].deepLinkCount).toBe(3 + 2 + 1 + 1); // nas + AI + GitHub + nas(15)
  });

  it('标题重复的目录共存，各自可索引', () => {
    const m = buildModel(ROOT_CHILDREN, ONLY_BAR);
    expect(m.folderIndex.get('11')!.title).toBe('nas');
    expect(m.folderIndex.get('15')!.title).toBe('nas');
    expect(m.linksByFolder.get('15')![0].title).toBe('另一个 nas 入口');
  });
});

describe('展示规则（文档 6.2 核心约束）', () => {
  it('linksByFolder 只含直接子书签，不含子目录节点', () => {
    const m = buildModel(ROOT_CHILDREN, ONLY_BAR);
    const nasLinks = m.linksByFolder.get('11')!;
    expect(nasLinks).toHaveLength(1);
    expect(nasLinks[0].title).toBe('NAS 面板');
    // 子目录「本地」「hk」的书签不会平铺到 nas
    expect(nasLinks.map((l) => l.title)).not.toContain('影音');
    expect(nasLinks.map((l) => l.title)).not.toContain('监控');
    // 所有 value 都是有 url 的书签
    for (const links of m.linksByFolder.values()) {
      for (const l of links) expect(l.url).toBeTruthy();
    }
  });

  it('选中父目录不返回子目录书签', () => {
    const m = buildModel(ROOT_CHILDREN, ONLY_BAR);
    expect(m.linksByFolder.get('11')!.map((l) => l.id)).toEqual(['1101']);
    expect(m.linksByFolder.get('111')!.map((l) => l.id)).toEqual(['1111']);
  });
});

describe('根文件夹选择', () => {
  it('只勾选「收藏夹栏」时，其他根节点数据完全不进入模型', () => {
    const m = buildModel(ROOT_CHILDREN, ONLY_BAR);
    expect(m.folderIndex.has('2')).toBe(false);
    expect(m.folderIndex.has('3')).toBe(false);
    expect(m.allLinks.some((l) => l.title === 'MDN')).toBe(false);
    expect(m.linksByFolder.has('2')).toBe(false);
  });

  it('多选根文件夹时都进入模型，保持顺序', () => {
    const m = buildModel(ROOT_CHILDREN, { enabledRootIds: ['1', '2'], showEmptyFolders: false });
    expect(m.roots.map((r) => r.id)).toEqual(['1', '2']);
    expect(m.allLinks.some((l) => l.title === 'MDN')).toBe(true);
  });
});

describe('空目录处理', () => {
  it('showEmptyFolders=false 时递归无书签的目录被隐藏', () => {
    const m = buildModel(ROOT_CHILDREN, ONLY_BAR);
    expect(m.folderIndex.has('13')).toBe(false);
    expect(m.folderIndex.has('131')).toBe(false);
    expect(m.roots[0].children.map((c) => c.id)).not.toContain('13');
  });

  it('showEmptyFolders=true 时空目录保留', () => {
    const m = buildModel(ROOT_CHILDREN, { enabledRootIds: ['1'], showEmptyFolders: true });
    expect(m.folderIndex.has('13')).toBe(true);
    expect(m.folderIndex.get('13')!.deepLinkCount).toBe(0);
  });
});

describe('顺序与 allLinks', () => {
  it('保持浏览器原始顺序', () => {
    const m = buildModel(ROOT_CHILDREN, { enabledRootIds: ['1'], showEmptyFolders: true });
    // children 只含目录（书签 GitHub 不在其中 —— 这正是文档 6.2 的核心规则），且保持原始顺序
    expect(m.roots[0].children.map((c) => c.title)).toEqual(['nas', 'AI', '空目录', 'nas']);
    expect(m.allLinks.map((l) => l.id)).toEqual(['1101', '1111', '1121', '1201', '1202', '14', '1501']);
  });

  it('LinkNode 带 domain 与 parentId', () => {
    const m = buildModel(ROOT_CHILDREN, ONLY_BAR);
    const link = m.allLinks.find((l) => l.id === '1101')!;
    expect(link.domain).toBe('nas.example.com');
    expect(link.parentId).toBe('11');
  });
});

describe('parseDomain', () => {
  it('解析域名并去掉 www 前缀', () => {
    expect(parseDomain('https://www.github.com/a/b?q=1')).toBe('github.com');
    expect(parseDomain('http://192.168.1.10:8096/x')).toBe('192.168.1.10');
  });
  it('非法 URL / 伪协议返回空串', () => {
    expect(parseDomain('not a url')).toBe('');
    expect(parseDomain('javascript:alert(1)')).toBe('');
  });
});
