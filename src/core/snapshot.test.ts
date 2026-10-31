import { beforeEach, describe, expect, it } from 'vitest';
import { resetMemoryStore } from './chrome';
import { loadUI, saveUI } from './snapshot';

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
