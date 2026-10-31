import { beforeEach, describe, expect, it } from 'vitest';
import { buildModel } from './bookmarks';
import { resetMemoryStore, storageGet, storageSet } from './chrome';
import { SNAPSHOT_KEY, loadSnapshot, loadUI, saveSnapshot, saveUI } from './snapshot';
import type { BookmarkTreeNode } from './chrome';
import type { LinkNode } from './types';

/**
 * saveUI 走 chrome.ts 的内存降级存储（测试环境未安装 chrome mock），
 * 配合 resetMemoryStore 隔离用例。
 */
describe('saveUI 写入串行化（P1-4）', () => {
  beforeEach(() => {
    resetMemoryStore();
  });

  it('两次并发写入不再互相覆盖', async () => {
    // 故意不 await 第一次：修复前两次"读-改-写"交错，lastFolderId 会被丢掉
    const a = saveUI({ lastFolderId: 'folder-1' });
    const b = saveUI({ sidebarWidth: 320 });
    await Promise.all([a, b]);
    const ui = await loadUI();
    expect(ui.lastFolderId).toBe('folder-1');
    expect(ui.sidebarWidth).toBe(320);
  });

  it('连续写入按序增量合并，后写覆盖同名字段', async () => {
    await saveUI({ lastFolderId: 'f1' });
    await saveUI({ sidebarWidth: 280 });
    await saveUI({ lastFolderId: 'f2' });
    expect(await loadUI()).toEqual({ lastFolderId: 'f2', sidebarWidth: 280 });
  });

  it('空补丁不破坏已有状态', async () => {
    await saveUI({ sidebarWidth: 300 });
    await saveUI({});
    expect(await loadUI()).toEqual({ sidebarWidth: 300 });
  });
});

/** 快照 v2 往返、指纹 / 过期 / 体积门禁与旧版清理（P1-2 + P2-13 覆盖） */
describe('快照往返与降级（v2）', () => {
  const SCOPE = { enabledRootIds: ['1'], showEmptyFolders: false };
  const TREE: BookmarkTreeNode[] = [
    {
      id: '1',
      title: '收藏夹栏',
      children: [
        { id: '11', title: 'nas', children: [{ id: '111', title: '面板', url: 'https://nas.example.com' }] },
        { id: '12', title: 'GitHub', url: 'https://github.com' },
      ],
    },
  ];

  beforeEach(() => {
    resetMemoryStore();
  });

  it('serialize → 存储 → revive 往返后模型等价（allLinks 由 links 推导）', async () => {
    const model = buildModel(TREE, SCOPE);
    await saveSnapshot(model, SCOPE);
    const revived = await loadSnapshot(SCOPE);
    expect(revived).not.toBeNull();
    expect(revived!.roots).toEqual(model.roots);
    const ids = (links: LinkNode[]) => links.map((l) => l.id).sort();
    expect(ids(revived!.allLinks)).toEqual(ids(model.allLinks));
    expect([...revived!.linksByFolder.entries()]).toEqual([...model.linksByFolder.entries()]);
    expect(revived!.folderIndex.get('11')?.title).toBe('nas');
  });

  it('作用域指纹不符直接丢弃（改完设置不再闪旧数据）', async () => {
    await saveSnapshot(buildModel(TREE, SCOPE), SCOPE);
    expect(await loadSnapshot({ ...SCOPE, enabledRootIds: ['2'] })).toBeNull();
    expect(await loadSnapshot({ ...SCOPE, showEmptyFolders: true })).toBeNull();
    expect(await loadSnapshot(SCOPE)).not.toBeNull();
  });

  it('超过 7 天的快照被丢弃', async () => {
    await saveSnapshot(buildModel(TREE, SCOPE), SCOPE);
    const snap = await storageGet<Record<string, unknown>>('local', SNAPSHOT_KEY);
    await storageSet('local', SNAPSHOT_KEY, { ...snap, savedAt: Date.now() - 8 * 24 * 3600 * 1000 });
    expect(await loadSnapshot(SCOPE)).toBeNull();
  });

  it('序列化超过 2MB 的模型不写入缓存', async () => {
    const big: BookmarkTreeNode[] = [
      {
        id: '1',
        title: 'r',
        children: Array.from({ length: 6000 }, (_, i) => ({
          id: `b${i}`,
          title: `title-${i}-${'x'.repeat(400)}`,
          url: `https://example.com/${i}`,
        })),
      },
    ];
    await saveSnapshot(buildModel(big, SCOPE), SCOPE);
    expect(await storageGet('local', SNAPSHOT_KEY)).toBeUndefined();
    expect(await loadSnapshot(SCOPE)).toBeNull();
  });

  it('旧 v1 快照不再读取，并在 v2 写入成功后被清理', async () => {
    await storageSet('local', 'modelSnapshot.v1', { v: 1, roots: [], links: [], allLinks: [] });
    expect(await loadSnapshot(SCOPE)).toBeNull();
    await saveSnapshot(buildModel(TREE, SCOPE), SCOPE);
    expect(await storageGet('local', 'modelSnapshot.v1')).toBeUndefined();
  });

  it('形状不对的脏快照被丢弃', async () => {
    await storageSet('local', SNAPSHOT_KEY, { v: 2, savedAt: Date.now(), rootsKey: '1|0' });
    expect(await loadSnapshot(SCOPE)).toBeNull();
  });
});
