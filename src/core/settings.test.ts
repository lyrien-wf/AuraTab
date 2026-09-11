import { afterEach, describe, expect, it } from 'vitest';
import { installChromeMock, type ChromeMock } from '../test/mock-chrome';
import type { BookmarkTreeNode } from './chrome';
import { loadModel } from './bookmarks';
import { DEFAULT_SETTINGS, loadSettings, mergeSettings, saveSettings } from './settings';
import type { Settings } from './types';

const TREE: BookmarkTreeNode[] = [
  {
    id: '0',
    title: '',
    children: [
      { id: '1', title: '收藏夹栏', children: [{ id: '11', title: 'Claude', url: 'https://claude.ai' }] },
      { id: '2', title: '其他收藏夹', children: [{ id: '21', title: 'MDN', url: 'https://developer.mozilla.org' }] },
      { id: '3', title: '移动收藏夹', children: [] },
    ],
  },
];

let mock: ChromeMock | null = null;

afterEach(() => {
  mock?.uninstall();
  mock = null;
});

describe('loadSettings', () => {
  it('首次运行：默认勾选第一个根文件夹（动态 id，不硬编码）并写入存储', async () => {
    mock = installChromeMock({ tree: TREE });
    const s = await loadSettings();
    expect(s.enabledRootIds).toEqual(['1']);
    expect(s.searchEngine).toBe(DEFAULT_SETTINGS.searchEngine);
    expect(mock.store.sync.get('settings')).toBeTruthy();
  });

  it('已保存空勾选时尊重用户选择，不再自动回填', async () => {
    mock = installChromeMock({ tree: TREE, syncData: { settings: { enabledRootIds: [] } } });
    const s = await loadSettings();
    expect(s.enabledRootIds).toEqual([]);
    // 其余字段用默认值补齐
    expect(s.showEmptyFolders).toBe(false);
    expect(s.clock).toEqual(DEFAULT_SETTINGS.clock);
  });

  it('设置 → 模型联动：只勾选的根进入模型', async () => {
    mock = installChromeMock({ tree: TREE });
    const s = await loadSettings();
    const m = await loadModel(s);
    expect(m.roots.map((r) => r.id)).toEqual(['1']);
    expect(m.allLinks.map((l) => l.title)).toEqual(['Claude']);
  });
});

describe('mergeSettings', () => {
  it('clock 深合并，旧版本缺字段可容忍', () => {
    const merged = mergeSettings({ clock: { showSeconds: true } as Partial<Settings['clock']> as Settings['clock'] });
    expect(merged.clock).toEqual({ format24h: true, showSeconds: true, showDate: true });
  });

  it('顶层字段覆盖默认值', () => {
    const merged = mergeSettings({ searchEngine: 'google', cardsPerRowHint: 6 });
    expect(merged.searchEngine).toBe('google');
    expect(merged.cardsPerRowHint).toBe(6);
    expect(merged.theme).toBe('system');
  });

  it('旧版非法每行卡片数（4/5）归一化为 auto，新值 6/8/10 保留', () => {
    expect(mergeSettings({ cardsPerRowHint: 4 as unknown as Settings['cardsPerRowHint'] }).cardsPerRowHint).toBe('auto');
    expect(mergeSettings({ cardsPerRowHint: 5 as unknown as Settings['cardsPerRowHint'] }).cardsPerRowHint).toBe('auto');
    expect(mergeSettings({ cardsPerRowHint: 10 }).cardsPerRowHint).toBe(10);
    expect(mergeSettings({ cardsPerRowHint: 'auto' }).cardsPerRowHint).toBe('auto');
  });
});

describe('saveSettings', () => {
  it('保存到 sync 区并可回读', async () => {
    mock = installChromeMock({ tree: TREE });
    const s = await loadSettings();
    const next: Settings = { ...s, searchEngine: 'baidu', treeDefaultExpandDepth: 2 };
    await saveSettings(next);
    const again = await loadSettings();
    expect(again.searchEngine).toBe('baidu');
    expect(again.treeDefaultExpandDepth).toBe(2);
    expect(again.enabledRootIds).toEqual(['1']);
  });
});
