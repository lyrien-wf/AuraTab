import { beforeEach, describe, expect, it } from 'vitest';
import { buildModel } from './bookmarks';
import { resetMemoryStore, storageSet } from './chrome';
import { loadSnapshot, loadUI, saveSnapshot, saveUI } from './snapshot';
import type { BookmarkTreeNode } from './chrome';

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

/** 快照序列化 / 回读往返与畸形快照丢弃（P2-13：snapshot 纯函数覆盖） */
describe('快照往返与降级', () => {
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

  it('serialize → 存储 → revive 往返后模型等价', async () => {
    const model = buildModel(TREE, { enabledRootIds: ['1'], showEmptyFolders: false });
    await saveSnapshot(model);
    const revived = await loadSnapshot();
    expect(revived).not.toBeNull();
    expect(revived!.roots).toEqual(model.roots);
    expect(revived!.allLinks).toEqual(model.allLinks);
    expect([...revived!.linksByFolder.entries()]).toEqual([...model.linksByFolder.entries()]);
    expect(revived!.folderIndex.size).toBe(model.folderIndex.size);
    expect(revived!.folderIndex.get('11')?.title).toBe('nas');
  });

  it('版本不符 / 字段缺失的畸形快照被丢弃为 null', async () => {
    await storageSet('local', 'modelSnapshot.v1', { v: 99, roots: [] });
    expect(await loadSnapshot()).toBeNull();

    await storageSet('local', 'modelSnapshot.v1', { v: 1 });
    expect(await loadSnapshot()).toBeNull();

    await storageSet('local', 'modelSnapshot.v1', '不是对象');
    expect(await loadSnapshot()).toBeNull();
  });
});
